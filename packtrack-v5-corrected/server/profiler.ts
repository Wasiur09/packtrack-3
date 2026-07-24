import { Request, Response, NextFunction } from 'express';
import { addRequestMetric, getRequestMetrics, getActiveSessionCount } from './db';
import { SystemProfile } from '../src/types';
import os from 'os';

let cpuStart = process.cpuUsage();
let cpuTimeStart = Date.now();

// Profiler middleware to measure request duration
export function profilerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const duration = Math.round((diff[0] * 1e3 + diff[1] * 1e-6) * 100) / 100; // ms

    // Avoid logging static asset files (Vite /src/ etc. in dev)
    if (
      req.url.startsWith('/api') ||
      req.url.endsWith('.html') ||
      req.url === '/'
    ) {
      addRequestMetric({
        timestamp: Date.now(),
        method: req.method,
        url: req.baseUrl + req.path,
        status: res.statusCode,
        duration
      });
    }
  });

  next();
}

// Function to collect current hardware/process stats
export function collectSystemProfile(): SystemProfile {
  // Calculate CPU Usage since last collect
  const cpuEnd = process.cpuUsage(cpuStart);
  const cpuTimeEnd = Date.now();
  const elapsedMs = cpuTimeEnd - cpuTimeStart;
  
  // reset starts
  cpuStart = process.cpuUsage();
  cpuTimeStart = cpuTimeEnd;

  const totalCpuTime = (cpuEnd.user + cpuEnd.system) / 1000; // Convert to ms
  const cpuPercent = elapsedMs > 0 ? Math.min(100, Math.round((totalCpuTime / (elapsedMs * os.cpus().length)) * 100)) : 0;

  // Memory Usage
  const mem = process.memoryUsage();
  const memoryUsed = Math.round(mem.rss / (1024 * 1024)); // MB
  const memoryTotal = Math.round(os.totalmem() / (1024 * 1024)); // MB

  // Metrics history calculations
  const metrics = getRequestMetrics();
  const totalRequests = metrics.length;
  
  const avgLatency = metrics.length > 0 
    ? Math.round(metrics.reduce((acc, m) => acc + m.duration, 0) / metrics.length)
    : 0;

  return {
    cpuUsage: cpuPercent || 1, // avoid 0 for better visual charts
    memoryUsed,
    memoryTotal,
    uptime: Math.round(process.uptime()),
    totalRequests,
    averageLatency: avgLatency,
    activeSessions: getActiveSessionCount() || 1
  };
}
