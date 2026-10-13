/**
 * Safe Haptics module utilizing navigator.vibrate
 */
export class Haptics {
  constructor() {
    this.enabled = true;
  }

  setEnabled(val) {
    this.enabled = !!val;
  }

  vibrate(pattern) {
    if (!this.enabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore vibration errors if not supported or blocked by user agent
    }
  }

  tap() {
    this.vibrate(12);
  }

  slide() {
    this.vibrate(16);
  }

  connect() {
    this.vibrate([10, 20, 10]);
  }

  error() {
    this.vibrate([35, 30, 25]);
  }

  victory() {
    this.vibrate([30, 40, 30, 40, 60]);
  }
}

export const haptics = new Haptics();
