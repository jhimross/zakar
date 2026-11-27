// Shortcut labels that match the keyboard: ⌘K on Apple devices, Ctrl K everywhere else.
const apple = /Mac|iPhone|iPad|iPod/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent);

export const modKey = apple ? '⌘' : 'Ctrl ';
