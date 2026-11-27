<?php

final class DJ_RequestLifecycle {
    public static function table(): string {
        return DJ_Database::get_table_name('music_request_lifecycle');
    }

    public static function install(): void {
        $table = self::table();
        DJ_Database::pdo()->exec("CREATE TABLE IF NOT EXISTS $table (
            event_id varchar(64) NOT NULL PRIMARY KEY,
            timezone varchar(64) NULL,
            start_at bigint NULL,
            cutoff_at bigint NULL,
            extension_minutes int NOT NULL DEFAULT 0,
            ended_at bigint NULL
        )");
    }

    public static function settings(string $id): array {
        return DJ_Database::get_row('SELECT * FROM ' . self::table() . ' WHERE event_id = ?', [$id]) ?: [];
    }

    public static function timezone(string $name): ?DateTimeZone {
        return in_array($name, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true)
            ? new DateTimeZone($name) : null;
    }

    public static function timestamp(string $local, DateTimeZone $zone): ?int {
        $value = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $local, $zone);
        return $value && $value->format('Y-m-d\TH:i') === $local ? $value->getTimestamp() : null;
    }

    public static function status(?array $event, ?array $link, array $override, ?int $now = null): array {
        $now = $now ?? time();
        $zone = self::timezone($override['timezone'] ?? $event['timezone'] ?? 'America/New_York')
            ?? new DateTimeZone('America/New_York');
        $day = $event['date'] ?? '';
        $startTime = $event['startTime'] ?? '';
        $endTime = $event['endTime'] ?? '';
        $start = self::timestamp($day . 'T' . $startTime, $zone);
        $endDay = $day;
        if ($start !== null && $endTime < $startTime) {
            $endDay = (new DateTimeImmutable($day, $zone))->modify('+1 day')->format('Y-m-d');
        }
        $end = self::timestamp($endDay . 'T' . $endTime, $zone);
        if ($start !== null && $end !== null && $end > $start) {
            // The scheduled end may already include the purchased time. Add only booked
            // overtime still outside that window, leaving shorter base schedules intact.
            $package = $event['weddingPackage'] ?? $event['schoolPackage'] ?? $event['privatePackage'] ?? [];
            $extra = $package['selection']['extraHalfHours'] ?? (($package['selection']['extraHours'] ?? 0) * 2);
            $base = $package['package']['hours'] ?? 0;
            if (isset($package['selection']['djHours'])) {
                $base = 4;
                $extra = max(0, ($package['selection']['djHours'] - $base) * 2);
            }
            $extraSeconds = (int)(max(0, min(40, $extra)) * 1800);
            if ($extraSeconds > 0) {
                $end += $base > 0
                    ? max(0, min($extraSeconds, $start + (int)($base * 3600) + $extraSeconds - $end))
                    : $extraSeconds;
            }
        }
        $start = isset($override['start_at']) ? (int)$override['start_at'] : $start;
        $end = isset($override['cutoff_at']) ? (int)$override['cutoff_at'] : $end;
        $cutoff = $start !== null && $end !== null && $end > $start
            ? $end + (int)($override['extension_minutes'] ?? 0) * 60 : null;
        if (isset($override['ended_at'])) $cutoff = (int)$override['ended_at'];
        $archive = $cutoff === null ? null : $cutoff + 3600;
        $booking = $event['status'] ?? '';
        if ($booking === 'Archived' || ($archive !== null && $now >= $archive)) {
            $state = 'archived';
        } elseif (!$event || in_array($booking, ['Canceled', 'Completed'], true) || ($cutoff !== null && $now >= $cutoff)) {
            $state = 'closed';
        } elseif ($start === null || $cutoff === null || $now < $start) {
            $state = 'standby';
        } else {
            $state = empty($link['enabled']) ? 'paused' : 'active';
        }
        return [
            'state' => $state, 'startsAt' => $start, 'cutoffAt' => $cutoff, 'archiveAt' => $archive,
            'timezone' => $zone->getName(), 'ended' => isset($override['ended_at']),
            'terminal' => !$event || in_array($booking, ['Canceled', 'Completed', 'Archived'], true),
            'overrideStart' => isset($override['start_at']) ? self::local((int)$override['start_at'], $zone) : '',
            'overrideCutoff' => isset($override['cutoff_at']) ? self::local((int)$override['cutoff_at'], $zone) : ''
        ];
    }

    private static function local(int $stamp, DateTimeZone $zone): string {
        return (new DateTimeImmutable('@' . $stamp))->setTimezone($zone)->format('Y-m-d\TH:i');
    }

    public static function current(?array $event, ?array $link): array {
        return self::status($event, $link, $event ? self::settings($event['id']) : []);
    }

    public static function lockedEvent(string $id): ?array {
        $events = DJ_Database::get_table_name('events');
        DJ_Database::query("UPDATE $events SET version = version WHERE id = ?", [$id]);
        return DJ_Database::get_event($id);
    }

    public static function saveBooking(array $input, string $id): array {
        self::install();
        $pdo = DJ_Database::pdo();
        $closing = in_array($input['status'] ?? '', ['Canceled', 'Archived', 'Completed'], true);
        $pdo->beginTransaction();
        try {
            $link = DJ_RequestKiosk::lockEvent($id);
            $event = self::lockedEvent($id);
            if (!$event || (isset($input['version']) && (int)$input['version'] !== $event['version'])) {
                $pdo->rollBack();
                return $event ? ['error' => 'This event changed. Reload before saving.', 'code' => 409]
                    : ['error' => 'Event not found', 'code' => 404];
            }
            if ($link) {
                $lifecycle = self::current($event, $link);
                if ($lifecycle['state'] === 'archived') {
                    // Freeze the archive boundary before a booking edit can move it.
                    $override = self::settings($id);
                    $override['ended_at'] = min(time() - 3600, $lifecycle['cutoffAt'] ?? time());
                    DJ_Database::replace(self::table(), array_merge($override, ['event_id' => $id]));
                }
            }
            if ($closing) {
                // Booking closure already uses its own transaction to revoke paired kiosks.
                $pdo->commit();
                return DJ_Database::save_event($input, $id);
            }
            $saved = DJ_Database::save_event($input, $id);
            $pdo->commit();
            return $saved;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }
    public static function guardHistory(string $id, ?array $link): void {
        if (self::current(self::lockedEvent($id), $link)['state'] === 'archived') {
            DJ_Database::pdo()->rollBack();
            json_error('Request history is archived in Event HQ.', 409);
        }
    }
}
