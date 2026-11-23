<?php

final class DJ_iTunesCatalog {
    private const CACHE_SECONDS = 1800;
    private const REQUESTS_PER_MINUTE = 18;
    private const MAX_CACHED_SEARCHES = 100;

    public static function search(string $term, bool $school): array {
        $term = trim(preg_replace('/\s+/u', ' ', $term) ?? '');
        if (mb_strlen($term) < 3 || mb_strlen($term) > 120) {
            throw new InvalidArgumentException('Enter 3 to 120 characters to search.');
        }

        $key = hash('sha256', ($school ? 'school:' : 'standard:') . mb_strtolower($term));
        $cached = self::withCache(function (array &$state, int $now) use ($key) {
            if (($state['searches'][$key]['expires'] ?? 0) > $now) {
                return [$state['searches'][$key]['tracks'], false];
            }
            $state['calls'] = array_values(array_filter($state['calls'], static fn($time) => $time > $now - 60));
            if (count($state['calls']) >= self::REQUESTS_PER_MINUTE) {
                throw new RuntimeException('Catalog search is busy. Try again in a minute or enter the song manually.', 429);
            }
            $state['calls'][] = $now;
            return [null, true];
        });
        if ($cached !== null) return $cached;

        $query = http_build_query([
            'term' => $term,
            'country' => 'US',
            'media' => 'music',
            'entity' => 'song',
            'limit' => 12,
            'explicit' => $school ? 'No' : 'Yes',
        ], '', '&', PHP_QUERY_RFC3986);
        $tracks = self::extractTracks(self::fetch('https://itunes.apple.com/search?' . $query), $school);

        self::withCache(function (array &$state, int $now) use ($key, $tracks) {
            $state['searches'] = array_filter($state['searches'], static fn($entry) => $entry['expires'] > $now);
            unset($state['searches'][$key]);
            $state['searches'][$key] = ['expires' => $now + self::CACHE_SECONDS, 'tracks' => $tracks];
            $state['searches'] = array_slice($state['searches'], -self::MAX_CACHED_SEARCHES, null, true);
            return [null, true];
        });
        return $tracks;
    }

    private static function withCache(callable $operation) {
        $directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'dj-desk-catalog-' . hash('sha256', __DIR__);
        if (!is_dir($directory) && !@mkdir($directory, 0700) && !is_dir($directory)) {
            throw new RuntimeException('Catalog cache unavailable.');
        }
        $file = @fopen($directory . DIRECTORY_SEPARATOR . 'search.json', 'c+b');
        if (!$file) throw new RuntimeException('Catalog cache unavailable.');

        try {
            if (!flock($file, LOCK_EX)) throw new RuntimeException('Catalog cache unavailable.');
            $contents = stream_get_contents($file);
            $state = $contents === '' ? ['calls' => [], 'searches' => []] : json_decode($contents, true);
            if (!is_array($state['calls'] ?? null) || !is_array($state['searches'] ?? null)) {
                throw new RuntimeException('Catalog cache unavailable.');
            }
            [$value, $changed] = $operation($state, time());
            if ($changed) {
                $encoded = json_encode($state, JSON_THROW_ON_ERROR);
                rewind($file);
                if (fwrite($file, $encoded) !== strlen($encoded) || !ftruncate($file, strlen($encoded)) || !fflush($file)) {
                    throw new RuntimeException('Catalog cache unavailable.');
                }
            }
            return $value;
        } finally {
            fclose($file);
        }
    }

    private static function fetch(string $url): array {
        if (function_exists('curl_init')) {
            $request = curl_init($url);
            curl_setopt_array($request, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT_MS => 1000,
                CURLOPT_TIMEOUT_MS => 2800,
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
            ]);
            $body = curl_exec($request);
            $status = (int)curl_getinfo($request, CURLINFO_RESPONSE_CODE);
        } else {
            $context = stream_context_create(['http' => [
                'timeout' => 2.8,
                'follow_location' => 0,
                'header' => 'Accept: application/json',
            ]]);
            $body = @file_get_contents($url, false, $context, 0, 262144);
            $headers = function_exists('http_get_last_response_headers') ? http_get_last_response_headers() : ($http_response_header ?? []);
            $status = (int)(explode(' ', $headers[0] ?? '', 3)[1] ?? 0);
        }

        if ($status === 429) throw new RuntimeException('Catalog search is busy. Try again in a minute or enter the song manually.', 429);
        $data = $status === 200 && is_string($body) ? json_decode($body, true) : null;
        if (!is_array($data['results'] ?? null)) throw new RuntimeException('iTunes catalog unavailable.');
        return $data['results'];
    }

    private static function extractTracks(array $results, bool $school): array {
        $tracks = [];
        foreach ($results as $result) {
            if (!is_array($result) || ($result['kind'] ?? '') !== 'song') continue;
            $title = $result['trackName'] ?? '';
            $artist = $result['artistName'] ?? '';
            $explicitness = $result['trackExplicitness'] ?? '';
            if ($school && $explicitness === 'explicit') continue;
            if (!is_string($title) || trim($title) === '' || !is_string($artist) || trim($artist) === '') continue;
            if (mb_strlen($title) > 160 || mb_strlen($artist) > 160) continue;
            $id = $result['trackId'] ?? null;
            if (!is_int($id) || isset($tracks[$id])) continue;
            $tracks[$id] = [
                'id' => $id,
                'title' => $title,
                'artist' => $artist,
                'album' => is_string($result['collectionName'] ?? null) ? mb_substr($result['collectionName'], 0, 160) : '',
                'durationMs' => is_int($result['trackTimeMillis'] ?? null) && $result['trackTimeMillis'] > 0 ? $result['trackTimeMillis'] : null,
                'explicitness' => in_array($explicitness, ['explicit', 'cleaned', 'notExplicit'], true) ? $explicitness : null,
            ];
            if (count($tracks) >= 12) break;
        }
        return array_values($tracks);
    }
}
