// LeapPlugin.swift — iOS placeholder for ViBo roadmap parity.
// Mirrors Android LeapPlugin interface so iOS integration can be implemented
// without changing upstream event contracts.

import Foundation

final class LeapPlugin {
    func infer(requestId: String, model: String, messages: [[String: Any]], system: String?, maxTokens: Int, temperature: Double) {
        // TODO: wire Leap iOS SDK streaming callbacks and emit:
        // - "llm-delta" { request_id, delta }
        // - "llm-done"  { request_id }
        // - "llm-error" { request_id, error }
        print("LeapPlugin.swift placeholder invoked for request \(requestId)")
    }
}
