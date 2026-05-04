import type { RequestTrace } from './types.js';

const BUFFER_SIZE = 50;
const traces: RequestTrace[] = [];

export function addTrace(trace: RequestTrace): void {
	traces.push(trace);
	if (traces.length > BUFFER_SIZE) traces.shift();
}

export function getTraces(): RequestTrace[] {
	return [...traces].reverse();
}

export function clearTraces(): void {
	traces.length = 0;
}
