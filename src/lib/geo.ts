export interface GeoResult {
	country: string;
	countryCode: string;
	city: string;
	lat: number;
	lng: number;
}

const cache = new Map<string, GeoResult | null>();

const PRIVATE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc00:|fd|localhost)/i;

export async function geolocate(ip: string): Promise<GeoResult | null> {
	if (PRIVATE.test(ip)) return null;
	if (cache.has(ip)) return cache.get(ip)!;
	try {
		const res = await fetch(
			`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,lat,lon`,
			{ signal: AbortSignal.timeout(1500) }
		);
		const d = await res.json() as {
			status: string; country: string; countryCode: string;
			city: string; lat: number; lon: number;
		};
		if (d.status !== 'success') { cache.set(ip, null); return null; }
		const geo: GeoResult = { country: d.country, countryCode: d.countryCode, city: d.city, lat: d.lat, lng: d.lon };
		cache.set(ip, geo);
		return geo;
	} catch {
		cache.set(ip, null);
		return null;
	}
}
