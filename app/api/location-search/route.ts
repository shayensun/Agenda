import { NextResponse } from 'next/server';

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  address?: Record<string, string>;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() ?? '';

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AgendaCalendar/1.0 (location search proxy)',
      'Accept-Language': 'en-US,en;q=0.8',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Location search failed.' }, { status: 502 });
  }

  const results = (await response.json()) as NominatimResult[];
  const suggestions = results.map((result) => ({
    displayName: result.display_name,
    lat: result.lat,
    lon: result.lon,
    subtitle: [result.type, result.address?.city, result.address?.state, result.address?.country]
      .filter(Boolean)
      .join(' · '),
  }));

  return NextResponse.json({ suggestions });
}
