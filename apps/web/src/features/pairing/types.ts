/**
 * Pairing state machine (see PROJECT spec section 28):
 *   IDLE -> CREATING_SESSION -> GENERATING_QR -> SCANNING -> RECONSTRUCTING
 *        -> AUTHENTICATING -> CONNECTED -> (EXPIRED | FAILED)
 * The sender skips SCANNING/RECONSTRUCTING (it displays the QR rather than scanning);
 * the receiver skips GENERATING_QR.
 */
export type PairingState =
  | { phase: "idle" }
  | { phase: "creating-session" }
  | { phase: "generating-qr" }
  | { phase: "scanning"; receivedParts: number[]; totalParts: number | null }
  | { phase: "reconstructing" }
  | { phase: "authenticating" }
  | { phase: "connected" }
  | { phase: "expired" }
  | { phase: "failed"; message: string };
