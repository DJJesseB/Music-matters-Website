<?php

final class DJ_InquiryReview {
    public static function details(array $input): array {
        $details = [];
        foreach (['venue', 'address', 'date', 'startTime', 'endTime'] as $field) {
            $value = $input[$field] ?? '';
            $limit = $field === 'address' ? 500 : 250;
            $details[$field] = is_string($value) && preg_match('/^.{0,' . $limit . '}/us', trim($value), $match) ? $match[0] : '';
        }
        return $details;
    }

    public static function missing(array $input): array {
        $details = self::details($input);
        $missing = [];
        foreach (['venue' => 'venue name', 'address' => 'venue street address'] as $field => $label) {
            if ($details[$field] === '' || preg_match('/^(unknown|tbd|n\/?a|to be (decided|determined|confirmed))\.?$/i', $details[$field])) {
                $missing[] = $label;
            }
        }
        $parts = explode('-', $details['date']);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', $details['date']) || !checkdate((int)$parts[1], (int)$parts[2], (int)$parts[0])) {
            $missing[] = 'event date';
        }
        foreach (['startTime' => 'event start time', 'endTime' => 'event end time'] as $field => $label) {
            if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/D', $details[$field])) $missing[] = $label;
        }
        if ($details['startTime'] !== '' && $details['startTime'] === $details['endTime']) {
            $missing[] = 'distinct start and end times';
        }
        return $missing;
    }

    public static function audit(array $body, string $action, string $actor, string $reason = ''): array {
        $body['inquiryHistory'][] = ['action' => $action, 'actor' => $actor, 'reason' => $reason, 'at' => gmdate(DATE_ATOM)];
        return $body;
    }

    public static function settings(array $config): array {
        $settings = $config['inquiry_travel'] ?? [];
        return [
            'homeBase' => (string)($settings['home_base'] ?? 'Millbrook, NY'),
            'lodgingMinutes' => (int)($settings['lodging_minutes'] ?? 120),
            'dayMinutes' => (int)($settings['day_warning_minutes'] ?? 720),
            'arrivalTime' => (string)($settings['arrival_warning_time'] ?? '02:00')
        ];
    }

    public static function travel(array $details, array $input, array $settings): array {
        $review = [];
        $issues = [];
        foreach (['outbound', 'return', 'setup', 'breakdown'] as $field) {
            $minutes = filter_var($input[$field] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 1440]]);
            if ($minutes === false) $issues[] = "$field minutes";
            $review[$field] = $minutes;
        }
        $decision = is_string($input['lodging'] ?? null) ? $input['lodging'] : '';
        $reason = is_string($input['lodgingReason'] ?? null) ? trim($input['lodgingReason']) : '';
        if (strlen($reason) > 1000) $issues[] = 'lodging notes under 1,000 characters';
        if (max($review['outbound'], $review['return']) > $settings['lodgingMinutes'] &&
            (!in_array($decision, ['Customer provides', 'Negotiate quote', 'Absorb cost', 'Waive', 'Decline'], true) || ($decision === 'Waive' && $reason === ''))) {
            $issues[] = 'lodging decision and a reason if waived';
        }
        if (empty($input['scheduleChecked'])) $issues[] = 'weekday employment and other commitments review';
        $parts = self::details($details);
        if (!self::missing($details) && !in_array(false, $review, true)) {
            $zone = new DateTimeZone('America/New_York');
            $start = new DateTimeImmutable($parts['date'] . ' ' . $parts['startTime'], $zone);
            $end = new DateTimeImmutable($parts['date'] . ' ' . $parts['endTime'], $zone);
            if ($end < $start) $end = $end->modify('+1 day');
            $review['totalMinutes'] = (int)(($end->getTimestamp() - $start->getTimestamp()) / 60) + array_sum($review);
            $arrival = $end->add(new DateInterval('PT' . ($review['breakdown'] + $review['return']) . 'M'));
            $review['arrivalHome'] = $arrival->format('Y-m-d H:i T');
            $cutoff = new DateTimeImmutable($parts['date'] . ' ' . $settings['arrivalTime'], $zone);
            if ($settings['arrivalTime'] < '12:00') $cutoff = $cutoff->modify('+1 day');
            $review['warnings'] = [];
            if ($review['totalMinutes'] >= $settings['dayMinutes']) $review['warnings'][] = 'Extended total day';
            if ($arrival >= $cutoff) $review['warnings'][] = 'Late arrival home';
        }
        return $review + ['missing' => $issues, 'lodging' => $decision, 'lodgingReason' => $reason, 'scheduleChecked' => !empty($input['scheduleChecked'])];
    }
}
