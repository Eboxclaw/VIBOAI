import { useEffect, useState } from "react";
import { Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { isPinSetup, verifyPin, setupPin } from "@/lib/crypto";

interface LockScreenProps {
  onUnlock: (pin: string) => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [isSetup, setIsSetup] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const loadPinStatus = async () => {
      try {
        const hasPin = await isPinSetup();
        setIsSetup(hasPin);
      } catch (statusError) {
        setError(statusError instanceof Error ? statusError.message : "Unable to read vault status.");
      }
    };

    void loadPinStatus();
  }, []);

  useEffect(() => {
    if (retryAt <= now) return;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(timer);
  }, [retryAt, now]);

  const remainingBackoffSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const isBackoffActive = retryAt > now;

  const handleSubmit = async () => {
    setError("");

    if (isBackoffActive) {
      setError(`Too many failed attempts. Try again in ${remainingBackoffSeconds}s.`);
      return;
    }

    if (isSetup) {
      try {
        const valid = await verifyPin(pin);
        if (valid) {
          setFailedAttempts(0);
          setRetryAt(0);
          onUnlock(pin);
        } else {
          const nextFailedAttempts = failedAttempts + 1;
          const backoffMs = Math.min(15000, nextFailedAttempts * 1000);
          setFailedAttempts(nextFailedAttempts);
          setRetryAt(Date.now() + backoffMs);
          setNow(Date.now());
          setError(`Incorrect PIN. Try again in ${Math.ceil(backoffMs / 1000)}s.`);
          setPin("");
        }
      } catch (unlockError) {
        setError(unlockError instanceof Error ? unlockError.message : "Unable to unlock vault.");
      }
      return;
    }

    if (step === "enter") {
      if (pin.length < 4) {
        setError("PIN must be at least 4 characters");
        return;
      }
      setStep("confirm");
      setConfirmPin("");
      return;
    }

    if (confirmPin !== pin) {
      setError("PINs don't match. Try again.");
      setConfirmPin("");
      return;
    }

    try {
      await setupPin(pin);
      onUnlock(pin);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Unable to set PIN.");
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-xs flex flex-col items-center gap-6">
        <div className="h-16 w-16 rounded-2xl bg-foreground/10 flex items-center justify-center">
          {isSetup ? (
            <Lock className="h-8 w-8 text-foreground" />
          ) : (
            <ShieldCheck className="h-8 w-8 text-foreground" />
          )}
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">
            {isSetup ? "Vault Locked" : "Set Up Encryption"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSetup
              ? "Enter your PIN to decrypt your notes"
              : step === "enter"
                ? "Create a PIN to encrypt your notes at rest"
                : "Confirm your PIN"}
          </p>
        </div>

        <div className="w-full space-y-3">
          <div className="relative">
            <input
              type={showPin ? "text" : "password"}
              value={step === "confirm" ? confirmPin : pin}
              onChange={(e) =>
                step === "confirm"
                  ? setConfirmPin(e.target.value)
                  : setPin(e.target.value)
              }
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={step === "confirm" ? "Confirm PIN..." : "Enter PIN..."}
              className="w-full h-12 rounded-xl bg-muted border border-border px-4 pr-10 text-center text-lg tracking-[0.3em] font-mono text-foreground placeholder:text-muted-foreground placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          {isBackoffActive && (
            <p className="text-xs text-muted-foreground text-center">
              Backoff active: wait {remainingBackoffSeconds}s before retrying.
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={isBackoffActive}
            className="w-full h-11 rounded-xl bg-foreground text-background font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSetup ? "Unlock" : step === "enter" ? "Next" : "Enable Encryption"}
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center max-w-[200px]">
          {isSetup
            ? "Your notes are encrypted with AES-256-GCM"
            : "Your PIN derives an AES-256 key to encrypt all notes locally"}
        </p>
      </div>
    </div>
  );
}
