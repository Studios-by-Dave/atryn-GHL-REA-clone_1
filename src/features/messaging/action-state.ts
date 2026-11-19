export type MessagingActionState = {
  error: string | null;
  sentAt: number | null;
};

export const initialMessagingState: MessagingActionState = {
  error: null,
  sentAt: null,
};
