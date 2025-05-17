'use strict';

class Scheduler {
  constructor(task, intervalMs) {
    this.task = task;
    this.intervalMs = intervalMs;
    this.timerId = null;
    this.isRunning = false;
  }

  async runTask() {
    console.log('Scheduler: Executing scheduled task...');
    try {
      await this.task();
      console.log('Scheduler: Task completed successfully.');
    } catch (error) {
      console.error('Scheduler: Error during scheduled task execution:', error);
    }
  }

  start() {
    if (this.isRunning) {
      console.log('Scheduler: Already running.');
      return;
    }
    console.log(`Scheduler: Starting task to run every ${this.intervalMs / 1000} seconds.`);
    // Run once immediately, then set interval
    this.runTask(); 
    this.timerId = setInterval(() => this.runTask(), this.intervalMs);
    this.isRunning = true;
  }

  stop() {
    if (!this.isRunning) {
      console.log('Scheduler: Not running.');
      return;
    }
    clearInterval(this.timerId);
    this.timerId = null;
    this.isRunning = false;
    console.log('Scheduler: Stopped.');
  }

  async runOnDemand() {
    console.log('Scheduler: Executing task on demand...');
    await this.runTask();
  }
}

module.exports = Scheduler; 