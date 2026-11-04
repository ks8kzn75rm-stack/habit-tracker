/** Shared reactions to ticks that happen outside the Today screen. */
import { store } from '../data/store.js';
import { celebrate, toast } from './overlay.js';

/** React to a toggleHabit() result: Morning Win, full house, level up… */
export function celebrateTick(result, { quiet = false } = {}) {
  if (!result) return;
  if (result.perfect) {
    celebrate({
      emoji: '🎉',
      title: 'Full house!',
      message: 'Every habit done today. Take a moment to enjoy that.',
      detail: result.morningWin ? `Including a Morning Win: +${store.settings.morningWinBonus} bonus` : '',
    });
  } else if (result.morningWin) {
    celebrate({
      emoji: '☀️',
      title: 'Morning Win!',
      message: 'Every morning habit done. You’ve set the tone for the whole day.',
      detail: `+${store.settings.morningWinBonus} bonus points`,
    });
  } else if (!quiet && result.done) {
    toast(`${result.habit.name} · +${result.habit.points}`, { emoji: '✅' });
  }
  if (result.weeklyGoalMet) toast(`Weekly goal met: ${result.habit.name}`, { emoji: '💪' });
  if (result.levelUp) toast(`Level ${result.levelUp.level} reached: ${result.levelUp.title}`, { emoji: '✨' });
}
