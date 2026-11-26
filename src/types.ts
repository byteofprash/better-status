export interface Meeting {
  /** Unique per (calendar event, start, content) so edited events are re-evaluated. */
  integrationId: string;
  name: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  scope: 'internal' | 'external';
  participantType: 'solo' | 'one_on_one' | 'group';
  participantCount: number;
}

export interface SlackStatus {
  text: string;
  emoji: string; // Slack shortcode, e.g. ":handshake:"
}

/** What we remember between runs for one user. */
export interface UserState {
  lastIntegrationId?: string;
  /** The status we last set, so we never overwrite one the user set by hand. */
  ours?: SlackStatus;
  lastSyncAt?: string;
  lastError?: string;
}

/** Everything about one connected person. Stored encrypted as a single blob. */
export interface UserRecord {
  id: string; // `${slackTeamId}-${slackUserId}`
  slackToken: string; // xoxp- user token
  googleRefreshToken?: string;
  talonUrl?: string; // each user brings their own deployment...
  talonKey?: string; // ...and Integration API key
  internalDomain?: string; // optional override; default = domain of the calendar owner
  state: UserState;
}

/** App-level credentials (identical for every user). */
export interface AppCreds {
  googleClientId: string;
  googleClientSecret: string;
}
