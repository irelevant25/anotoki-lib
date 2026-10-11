export type FeedbackStatus = 'new' | 'read' | 'resolved' | 'spam';

/** One message (Anotoki\Lib\Feedback\Http\FeedbackRoutes) - never the sender's address bucket. */
export interface FeedbackMessage {
  id: number;
  created_at: string;
  updated_at: string;
  /** The site's kinds: bug, idea, other by default. */
  kind: string;
  status: FeedbackStatus;
  section: string | null;
  subject: string | null;
  message: string;
  /** The site's extra fields, by name. */
  details: Record<string, string>;
  contact_email: string | null;
  /** The signed-in sender (the IAM's id); null for nobody, or "without my name". */
  user_id: number | null;
  user_name: string | null;
  /** A path, never a query. */
  page: string | null;
  language: string | null;
  user_agent: string | null;
  handled_by: number | null;
  handled_by_name: string | null;
  handled_at: string | null;
}

/** GET {feedback}?kind=&status=&section=&search=&page= */
export interface FeedbackList {
  total: number;
  page: number;
  pageSize: number;
  items: FeedbackMessage[];
}

/** GET {feedback}/facets */
export interface FeedbackFacets {
  kinds: string[];
  statuses: FeedbackStatus[];
  sections: string[];
  /** The site's extra fields: name -> most characters. */
  fields: Record<string, number>;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
}
