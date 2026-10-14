export interface ConnectedReadState {
  readonly kind: "ready" | "empty" | "not_synced" | "sync_failed" | "authorization_revoked" | "not_enabled";
  readonly label: string;
  readonly description: string;
  readonly scopeLabel: string;
  readonly nextStep: string;
}
