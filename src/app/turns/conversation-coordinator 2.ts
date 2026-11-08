/** Serializes chat turns for one user and conversation across runtime instances. */
export interface ConversationCoordinator {
  runExclusive<T>(userId: string, conversationId: string, operation: () => Promise<T>): Promise<T>;
}
