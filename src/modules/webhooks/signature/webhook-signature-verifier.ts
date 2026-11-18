/** Authenticates inbound webhook requests. */
export abstract class WebhookSignatureVerifier {
  /**
   * @param payload the exact raw request body bytes that were signed
   * @param signatureHeader the provider's signature header value
   * @returns `true` only for an authentic signature within the accepted time window
   */
  abstract verify(payload: Buffer, signatureHeader: string | undefined): boolean;
}
