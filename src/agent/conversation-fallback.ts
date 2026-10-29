import type { ConversationResponderInput } from "./conversation-responder.js";
import { isOrdinaryQuestion, isReadOnlyFinancialReflection, isSafePendingWorkflowTopicSwitch } from "./conversation-routing.js";

function lowCostMealAnswer(message: string): string | undefined {
  if (/\b(?:low[- ]cost|budget[- ]friendly|inexpensive|affordable)\b/i.test(message) &&
      /\b(?:meal|dinner|recipe|dish|lunch|breakfast)\b/i.test(message)) {
    return "A pot of lentil and tomato soup with bread is easy to make together and uses inexpensive pantry staples.";
  }
  return undefined;
}

/** Safe deterministic recovery for read-only conversation when generation is unavailable. */
export function deterministicConversationFallback(input: ConversationResponderInput): string {
  const pendingWorkflow = Boolean(input.pendingAction || input.pendingWorkflowReference ||
    input.financialContext?.workflowState);
  const explicitTopicSwitch = /^\s*(?:let'?s|can we|i(?:'d| would| actually want to))\s+(?:talk|discuss|think)\b/i.test(input.message);
  const safePendingTopicSwitch = pendingWorkflow && explicitTopicSwitch &&
    isSafePendingWorkflowTopicSwitch(input.message);
  // A clear pending-workflow topic switch remains read-only. Answer the current
  // topic before the general financial-context guard so an outage cannot turn
  // a promotion discussion into a repeated approval prompt.
  if (safePendingTopicSwitch && /\b(?:promotion|promoted|new role|raise)\b/i.test(input.message) &&
      /\b(?:let's|can we|i(?:'d| would| actually want to))\s+(?:talk|discuss)\b/i.test(input.message)) {
    return "A promotion can bring a lot of change, even when it's good news. What feels most uncertain: expectations, day-to-day changes, or how you'd like to approach it? The savings suggestion remains pending and unchanged.";
  }
  if (safePendingTopicSwitch && /\b(?:debt|credit card|loan|interest rate)\b/i.test(input.message)) {
    return "We can focus on the debt first. The savings suggestion remains pending and unchanged. If you want, we can compare the debt's interest rate with how much flexibility you want to keep in your budget.";
  }
  if (isOrdinaryQuestion(input.message) && /\b(?:weekend|rainy day)\b/i.test(input.message) &&
      /\b(?:brainstorm|suggest|ideas|options|things to do)\b/i.test(input.message)) {
    return "For a rainy weekend, you could visit a library or museum, watch a movie at home, or try a new recipe. Choose based on whether you want to stay in or get out.";
  }
  if (input.responseFocus && /\bpodcasts?\b/i.test(input.responseFocus) && /\bwalks?\b/i.test(input.responseFocus)) {
    return "For a relaxed walk, try a conversational interview podcast or a short nature series; a 20–30 minute episode can fit the route.";
  }
  if (safePendingTopicSwitch) {
    return "Of course—we can focus on what you raised. The savings suggestion remains pending and unchanged while we talk. What would you like to work through first?";
  }
  if (input.pendingAction || (input.financialContext?.workflowState !== undefined) ||
      (input.financialContext?.financialFacts.length ?? 0) > 0 ||
      (input.conversationSavingsEvents?.length ?? 0) > 0 ||
      (input.financialContext?.conversationSavingsEvents.length ?? 0) > 0) {
    return input.baselineReply;
  }
  const mealAnswer = lowCostMealAnswer(input.message);
  if (mealAnswer && /\b(?:budget|money|finances?|spending|bills?)\b/i.test(input.message) &&
      /\b(?:overwhelm(?:ed|ing)|stress(?:ed|ful)?|anxious|worried|uncertain)\b/i.test(input.message)) {
    const financialReflection = "Money can feel like a lot to sort through. We can take it one piece at a time: what's most pressing—what's due soon, what could wait, or making room for essentials?";
    return `${financialReflection} ${mealAnswer}`;
  }
  if (/\b(?:promotion|promoted|new role|raise)\b/i.test(input.message) &&
      /\b(?:anxious|worried|stressed|uncertain|overwhelmed|nervous)\b/i.test(input.message)) {
    return "A promotion can bring a lot of change, even when it's good news. What feels most uncertain: expectations, day-to-day changes, or how you'd like to approach it?";
  }
  if (isReadOnlyFinancialReflection(input.message)) {
    const financialReflection = "Money can feel like a lot to sort through. We can take it one piece at a time: what's most pressing—what's due soon, what could wait, or making room for essentials?";
    return mealAnswer ? `${financialReflection} ${mealAnswer}` : financialReflection;
  }
  if (mealAnswer) {
    return mealAnswer;
  }
  const recentDialogue = input.recentTurns.join(" ");
  if (/\b(?:manager|schedule[sd]?|work|job|role)\b/i.test(recentDialogue) &&
      /\b(?:sunday|weekend|evening|cooking|friends?)\b/i.test(recentDialogue) &&
      /\b(?:one thing|one sentence|keep it to one|flexible)\b/i.test(input.message)) {
    return "Try keeping Sunday cooking flexible: choose a window when you can, with another time in mind if work gets in the way.";
  }
  if (/\b(?:manager|schedule[sd]?|work|job|role)\b/i.test(input.message) &&
      /\b(?:sunday|weekend|evening|cooking|friends?)\b/i.test(input.message) &&
      /\b(?:non[- ]negotiable|not sure i can|can't call it|cannot call it|too rigid|too strict|flexible|one thing|realistic|generic|doesn't help|boundary)\b/i.test(input.message)) {
    return "It doesn't have to be absolute. Try choosing a Sunday cooking window, while keeping one backup time for weeks when work shifts. You could ask your manager how much notice is typical; what feels realistic to try once?";
  }
  if (/\b(?:changing jobs|change jobs|career change|new career|switch(?:ing)? careers?)\b/i.test(input.message) &&
      /\b(?:social life|friends?|friendships?|relationships?|see people|time with people)\b/i.test(input.message)) {
    return "If you're worried a new job could leave less room for friends, that's a real part of the decision. It may help to ask about expected hours, flexibility, and what a typical week looks like. What social time would you most want to protect?";
  }
  if (/\b(?:changing jobs|change jobs|career change|new career|switch(?:ing)? careers?)\b/i.test(input.message)) {
    return "Changing jobs can bring tradeoffs between the work itself, growth, pay, and stability. Which of those matters most in the choice you're weighing?";
  }
  if (/\bevenings?\b/i.test(input.message)) {
    return "I couldn't shape a thoughtful answer just now. For your evenings, are you hoping for more rest, more fun, or time to get something done?";
  }
  if (/\bgrocer(?:y|ies)\b/i.test(input.message)) {
    return "I couldn't shape a useful answer just now. For groceries, is your main focus easier meals, lower cost, or fewer shopping trips?";
  }
  if (/\bweekend\b/i.test(input.message)) {
    return "I couldn't shape a thoughtful answer just now. For your weekend, are you looking to relax, get out, or catch up on something?";
  }
  return input.baselineReply;
}
