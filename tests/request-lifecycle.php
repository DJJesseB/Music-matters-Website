<?php

require __DIR__ . '/../public_html/dj-desk/api/RequestLifecycle.php';

function check($actual, $expected, string $context): void {
    if ($actual !== $expected) {
        throw new RuntimeException($context . ': expected ' . json_encode($expected) . ', got ' . json_encode($actual));
    }
}

$school = ['type' => 'School dance', 'status' => 'Confirmed', 'date' => '2026-12-11',
    'startTime' => '18:00', 'endTime' => '20:00'];
$link = ['enabled' => 1];
$start = strtotime('2026-12-11T23:00:00Z');
$cutoff = strtotime('2026-12-12T01:00:00Z');
foreach ([$start - 1 => 'standby', $start => 'active', $cutoff - 1 => 'active',
    $cutoff => 'closed', $cutoff + 3599 => 'closed', $cutoff + 3600 => 'archived'] as $now => $state) {
    $result = DJ_RequestLifecycle::status($school, $link, [], $now);
    check($result['state'], $state, 'Boundary at ' . gmdate('c', $now));
    check($result['archiveAt'], $cutoff + 3600, 'One-hour archive');
}
check(DJ_RequestLifecycle::status($school, ['enabled' => 0], [], $start)['state'], 'paused', 'Existing paused link');
check(DJ_RequestLifecycle::status(array_replace($school, ['status' => 'Canceled']), $link, [], $start)['state'], 'closed', 'Canceled event');
check(DJ_RequestLifecycle::status(array_replace($school, ['endTime' => '']), $link, [], $start)['state'], 'standby', 'Missing end');
check(DJ_RequestLifecycle::status(array_replace($school, ['startTime' => '02:30', 'date' => '2026-03-08']),
    $link, [], $start)['state'], 'standby', 'Nonexistent local time');

$wedding = array_replace($school, [
    'type' => 'Wedding', 'startTime' => '18:00', 'endTime' => '22:00',
    'weddingPackage' => ['package' => ['hours' => 4], 'selection' => ['extraHalfHours' => 2]]
]);
$overtime = strtotime('2026-12-12T04:00:00Z');
check(DJ_RequestLifecycle::status($wedding, $link, [], $start)['cutoffAt'], $overtime, 'Booked wedding overtime');
$wedding['endTime'] = '23:00';
check(DJ_RequestLifecycle::status($wedding, $link, [], $start)['cutoffAt'], $overtime, 'Overtime included in scheduled end');
$private = array_replace($school, ['type' => 'Private event', 'startTime' => '20:00', 'endTime' => '00:00',
    'privatePackage' => ['selection' => ['djHours' => 5]]]);
check(DJ_RequestLifecycle::status($private, $link, [], $start)['cutoffAt'],
    strtotime('2026-12-12T06:00:00Z'), 'Overnight private booking with overtime');

$override = ['timezone' => 'America/Chicago', 'start_at' => $start, 'cutoff_at' => $cutoff, 'extension_minutes' => 30];
check(DJ_RequestLifecycle::status($school, $link, $override, $cutoff)['state'], 'active', 'Manual extension');
check(DJ_RequestLifecycle::status($school, $link, $override, $cutoff)['cutoffAt'], $cutoff + 1800, 'Manual cutoff');
check(DJ_RequestLifecycle::status($school, $link, $override + ['ended_at' => $start], $start)['state'], 'closed', 'Manual end');
echo "Request lifecycle boundary and booked overtime checks passed.\n";
