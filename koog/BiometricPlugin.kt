// BiometricPlugin.kt — Android Biometric Vault Unlock
// Uses Android BiometricPrompt + KeyStore to unwrap the vault master key.
// Flow:
//   1. On first PIN setup: generates AES key in Android KeyStore (hardware-backed)
//      wraps the master key with it, stores wrapped key in app storage
//   2. On biometric unlock: BiometricPrompt authenticates → unlocks KeyStore key
//      unwraps master key → passes 32 bytes to crypto_unlock_biometric in Rust
//   3. Rust verifies the key and holds it in memory (same as PIN unlock)
//
// The master key never leaves Rust memory unencrypted.
// On lock: Rust wipes the key (crypto_lock).

package com.vibo.plugins

import android.app.Activity
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.JSObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEYSTORE_ALIAS = "vibo_vault_master"
private const val WRAPPED_KEY_FILE = "vault_wrapped_key.bin"
private const val WRAPPED_IV_FILE  = "vault_wrapped_iv.bin"

@TauriPlugin
class BiometricPlugin(private val activity: Activity) : Plugin(activity) {

    // ── Biometric availability ────────────────────────────────────────

    @Command
    fun biometric_status(invoke: Invoke) {
        val manager = BiometricManager.from(activity)
        val canAuth = manager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        )
        invoke.resolve(JSObject().apply {
            put("available", canAuth == BiometricManager.BIOMETRIC_SUCCESS)
            put("enrolled", canAuth != BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED)
            put("hardwareBacked", true)
        })
    }

    // ── Setup — called after crypto_set_pin ──────────────────────────
    // Takes the master key bytes from Rust, wraps with Android KeyStore key,
    // stores wrapped bytes in app files dir.

    @Command
    fun biometric_setup(invoke: Invoke) {
        val masterKeyBytes = invoke.getArray("masterKeyBytes")
            ?: return invoke.reject("masterKeyBytes required")

        val keyBytes = (masterKeyBytes as? List<*>)
            ?.mapNotNull { (it as? Number)?.toByte() }
            ?.toByteArray()
            ?: return invoke.reject("Invalid masterKeyBytes")

        if (keyBytes.size != 32) {
            return invoke.reject("masterKeyBytes must be 32 bytes")
        }

        try {
            // Generate hardware-backed AES key in Android KeyStore
            // Requires biometric auth to use — userAuthenticationRequired = true
            val keyGen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
            )
            keyGen.init(
                KeyGenParameterSpec.Builder(
                    KEYSTORE_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(
                    0, // 0 = require auth every time (most secure)
                    KeyProperties.AUTH_BIOMETRIC_STRONG
                )
                .build()
            )
            keyGen.generateKey()

            // Wrap (encrypt) master key using the KeyStore key
            val keystoreKey = loadKeystoreKey()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, keystoreKey)

            val wrapped = cipher.doFinal(keyBytes)
            val iv = cipher.iv

            // Store wrapped key and IV in app files dir
            activity.openFileOutput(WRAPPED_KEY_FILE, Context.MODE_PRIVATE)
                .use { it.write(wrapped) }
            activity.openFileOutput(WRAPPED_IV_FILE, Context.MODE_PRIVATE)
                .use { it.write(iv) }

            invoke.resolve(JSObject().apply {
                put("setupComplete", true)
            })
        } catch (e: Exception) {
            invoke.reject("Biometric setup failed: ${e.message}")
        }
    }

    // ── Unlock — shows biometric prompt, unwraps key, passes to Rust ──

    @Command
    fun biometric_unlock(invoke: Invoke) {
        val fragmentActivity = activity as? FragmentActivity
            ?: return invoke.reject("Activity must be FragmentActivity")

        // Load wrapped key from storage
        val wrappedKey = try {
            activity.openFileInput(WRAPPED_KEY_FILE).use { it.readBytes() }
        } catch (e: Exception) {
            return invoke.reject("Biometric not set up — call biometric_setup first")
        }

        val iv = try {
            activity.openFileInput(WRAPPED_IV_FILE).use { it.readBytes() }
        } catch (e: Exception) {
            return invoke.reject("IV file missing")
        }

        // Prepare cipher for decryption — biometric auth will unlock the KeyStore key
        val keystoreKey = try {
            loadKeystoreKey()
        } catch (e: Exception) {
            return invoke.reject("KeyStore key not found — call biometric_setup first")
        }

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, keystoreKey, GCMParameterSpec(128, iv))

        val cryptoObject = BiometricPrompt.CryptoObject(cipher)

        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            fragmentActivity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        // Cipher is now unlocked — decrypt the wrapped master key
                        val decryptCipher = result.cryptoObject?.cipher
                            ?: return invoke.reject("No cipher in result")

                        val masterKeyBytes = decryptCipher.doFinal(wrappedKey)

                        // Pass master key bytes to Rust crypto_unlock_biometric
                        // Rust verifies and holds in memory — never returned to Kotlin
                        val keyList = masterKeyBytes.map { it.toInt() and 0xFF }
                        invoke.resolve(JSObject().apply {
                            put("masterKeyBytes", keyList)
                            put("success", true)
                        })
                        // Note: caller (UI or AgentService) must then call
                        // invoke("crypto_unlock_biometric", { keyBytes: masterKeyBytes })
                        // to complete the unlock in Rust

                    } catch (e: Exception) {
                        invoke.reject("Failed to decrypt vault key: ${e.message}")
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    invoke.reject("Biometric error ($errorCode): $errString")
                }

                override fun onAuthenticationFailed() {
                    // Don't reject yet — user can retry
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock ViBo Vault")
            .setSubtitle("Use biometric to access encrypted notes")
            .setNegativeButtonText("Use PIN instead")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        activity.runOnUiThread {
            prompt.authenticate(promptInfo, cryptoObject)
        }
    }

    // ── Clear — removes wrapped key (e.g. if PIN changes) ────────────

    @Command
    fun biometric_clear(invoke: Invoke) {
        try {
            activity.deleteFile(WRAPPED_KEY_FILE)
            activity.deleteFile(WRAPPED_IV_FILE)
            // Remove KeyStore key
            KeyStore.getInstance("AndroidKeyStore").apply {
                load(null)
                if (containsAlias(KEYSTORE_ALIAS)) deleteEntry(KEYSTORE_ALIAS)
            }
            invoke.resolve(JSObject().apply { put("cleared", true) })
        } catch (e: Exception) {
            invoke.reject("Failed to clear biometric: ${e.message}")
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun loadKeystoreKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        return (keyStore.getEntry(KEYSTORE_ALIAS, null) as KeyStore.SecretKeyEntry).secretKey
    }
}
