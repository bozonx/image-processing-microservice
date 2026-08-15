import { Injectable, type OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class HealthService implements OnApplicationShutdown {
  private draining = false;
  private readonly startedAt = Date.now();

  public startDraining(): void {
    this.draining = true;
  }

  public onApplicationShutdown(): void {
    this.startDraining();
  }

  public isShuttingDown(): boolean {
    return this.draining;
  }

  public uptimeSec(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }
}
