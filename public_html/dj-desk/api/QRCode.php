<?php
/**
 * Standalone QR Code SVG Generator in Pure PHP (Zero Dependencies)
 * Implements QR Code Model 2 (ISO/IEC 18004)
 */

class DJ_QRCode {
    private static $gfExp = null;
    private static $gfLog = null;

    private static function initGF() {
        if (self::$gfExp !== null) return;
        self::$gfExp = array_fill(0, 512, 0);
        self::$gfLog = array_fill(0, 256, 0);
        $x = 1;
        for ($i = 0; $i < 255; $i++) {
            self::$gfExp[$i] = $x;
            self::$gfLog[$x] = $i;
            $x <<= 1;
            if ($x & 0x100) {
                $x ^= 0x11d;
            }
        }
        for ($i = 255; $i < 512; $i++) {
            self::$gfExp[$i] = self::$gfExp[$i - 255];
        }
    }

    private static function gmult($x, $y) {
        if ($x == 0 || $y == 0) return 0;
        return self::$gfExp[self::$gfLog[$x] + self::$gfLog[$y]];
    }

    private static function rsPoly($n) {
        $poly = [1];
        for ($i = 0; $i < $n; $i++) {
            $next = [1];
            $factor = self::$gfExp[$i];
            $temp = [];
            foreach ($poly as $c) {
                $temp[] = self::gmult($c, $factor);
            }
            $temp[] = 0;
            $padded = array_merge([0], $poly);
            $poly = [];
            for ($j = 0; $j < count($temp); $j++) {
                $poly[] = $temp[$j] ^ $padded[$j];
            }
        }
        return $poly;
    }

    private static function rsEncode($data, $ecCount) {
        self::initGF();
        $gen = self::rsPoly($ecCount);
        $res = array_merge($data, array_fill(0, $ecCount, 0));
        for ($i = 0; $i < count($data); $i++) {
            $coef = $res[$i];
            if ($coef != 0) {
                for ($j = 0; $j < count($gen); $j++) {
                    $res[$i + $j] ^= self::gmult($gen[$j], $coef);
                }
            }
        }
        return array_slice($res, count($data));
    }

    // QR Capacity table for Byte mode (Version 1 to 10, ECC Level M)
    // Format: [version, totalBytes, dataBytes, ecBytes, numBlocks, size]
    private static $versionTable = [
        1  => ['total' => 26,  'data' => 16,  'ec' => 10, 'blocks' => 1, 'size' => 21],
        2  => ['total' => 44,  'data' => 28,  'ec' => 16, 'blocks' => 1, 'size' => 25],
        3  => ['total' => 70,  'data' => 44,  'ec' => 26, 'blocks' => 1, 'size' => 29],
        4  => ['total' => 100, 'data' => 64,  'ec' => 36, 'blocks' => 2, 'size' => 33],
        5  => ['total' => 134, 'data' => 86,  'ec' => 48, 'blocks' => 2, 'size' => 37],
        6  => ['total' => 172, 'data' => 108, 'ec' => 64, 'blocks' => 4, 'size' => 41],
        7  => ['total' => 196, 'data' => 124, 'ec' => 72, 'blocks' => 4, 'size' => 45],
        8  => ['total' => 242, 'data' => 154, 'ec' => 88, 'blocks' => 4, 'size' => 49],
        9  => ['total' => 292, 'data' => 182, 'ec' => 110, 'blocks' => 5, 'size' => 53],
        10 => ['total' => 346, 'data' => 216, 'ec' => 130, 'blocks' => 5, 'size' => 57]
    ];

    private static function chooseVersion($length) {
        foreach (self::$versionTable as $v => $info) {
            // Byte mode: 4 bits mode + 8 bits count + data*8
            $neededBytes = $length + 2; 
            if ($v >= 10) $neededBytes += 1;
            if ($neededBytes <= $info['data']) {
                return $v;
            }
        }
        return 10;
    }

    public static function svg($text, $size = 256, $margin = 4) {
        $bytes = array_values(unpack('C*', $text));
        $len = count($bytes);
        $v = self::chooseVersion($len);
        $vInfo = self::$versionTable[$v];
        $qrSize = $vInfo['size'];

        // Bit stream
        $bits = '';
        $bits .= '0100'; // Byte mode
        $bits .= str_pad(decbin($len), ($v >= 10 ? 16 : 8), '0', STR_PAD_LEFT);
        foreach ($bytes as $b) {
            $bits .= str_pad(decbin($b), 8, '0', STR_PAD_LEFT);
        }

        // Terminator & pad
        $maxBits = $vInfo['data'] * 8;
        $bits .= substr('0000', 0, max(0, min(4, $maxBits - strlen($bits))));
        if (strlen($bits) % 8 !== 0) {
            $bits .= str_repeat('0', 8 - (strlen($bits) % 8));
        }
        $padBytes = ['11101100', '00010001'];
        $p = 0;
        while (strlen($bits) < $maxBits) {
            $bits .= $padBytes[$p % 2];
            $p++;
        }

        $dataCodewords = [];
        for ($i = 0; $i < strlen($bits); $i += 8) {
            $dataCodewords[] = bindec(substr($bits, $i, 8));
        }

        // Divide into blocks & generate ECC
        $numBlocks = $vInfo['blocks'];
        $ecPerBlock = intval($vInfo['ec'] / $numBlocks);
        $baseDataPerBlock = intval(count($dataCodewords) / $numBlocks);

        $blocksData = [];
        $blocksEC = [];
        $offset = 0;
        for ($b = 0; $b < $numBlocks; $b++) {
            $blockSize = $baseDataPerBlock + ($b >= ($numBlocks - (count($dataCodewords) % $numBlocks)) ? 1 : 0);
            $block = array_slice($dataCodewords, $offset, $blockSize);
            $offset += $blockSize;
            $blocksData[] = $block;
            $blocksEC[] = self::rsEncode($block, $ecPerBlock);
        }

        // Interleave
        $finalCodewords = [];
        $maxD = max(array_map('count', $blocksData));
        for ($i = 0; $i < $maxD; $i++) {
            for ($b = 0; $b < $numBlocks; $b++) {
                if (isset($blocksData[$b][$i])) {
                    $finalCodewords[] = $blocksData[$b][$i];
                }
            }
        }
        for ($i = 0; $i < $ecPerBlock; $i++) {
            for ($b = 0; $b < $numBlocks; $b++) {
                if (isset($blocksEC[$b][$i])) {
                    $finalCodewords[] = $blocksEC[$b][$i];
                }
            }
        }

        // Build Matrix
        $matrix = array_fill(0, $qrSize, array_fill(0, $qrSize, null));
        $reserved = array_fill(0, $qrSize, array_fill(0, $qrSize, false));

        // 1. Finder patterns
        $setFinder = function($r0, $c0) use (&$matrix, &$reserved, $qrSize) {
            for ($r = -1; $r <= 7; $r++) {
                for ($c = -1; $c <= 7; $c++) {
                    $row = $r0 + $r;
                    $col = $c0 + $c;
                    if ($row >= 0 && $row < $qrSize && $col >= 0 && $col < $qrSize) {
                        $reserved[$row][$col] = true;
                        if ($r >= 0 && $r <= 6 && $c >= 0 && $c <= 6) {
                            $isBlack = ($r == 0 || $r == 6 || $c == 0 || $c == 6 || ($r >= 2 && $r <= 4 && $c >= 2 && $c <= 4));
                            $matrix[$row][$col] = $isBlack ? 1 : 0;
                        } else {
                            $matrix[$row][$col] = 0; // Separator
                        }
                    }
                }
            }
        };
        $setFinder(0, 0);
        $setFinder(0, $qrSize - 7);
        $setFinder($qrSize - 7, 0);

        // 2. Alignment patterns (version >= 2)
        if ($v >= 2) {
            $alignPositions = [
                2 => [6, 18],
                3 => [6, 22],
                4 => [6, 26],
                5 => [6, 30],
                6 => [6, 34],
                7 => [6, 22, 38],
                8 => [6, 24, 42],
                9 => [6, 26, 46],
                10 => [6, 28, 50]
            ][$v];

            foreach ($alignPositions as $ar) {
                foreach ($alignPositions as $ac) {
                    if ($reserved[$ar][$ac]) continue;
                    for ($r = -2; $r <= 2; $r++) {
                        for ($c = -2; $c <= 2; $c++) {
                            $row = $ar + $r;
                            $col = $ac + $c;
                            $reserved[$row][$col] = true;
                            $matrix[$row][$col] = (abs($r) == 2 || abs($c) == 2 || ($r == 0 && $c == 0)) ? 1 : 0;
                        }
                    }
                }
            }
        }

        // 3. Timing patterns
        for ($i = 8; $i < $qrSize - 8; $i++) {
            if (!$reserved[6][$i]) {
                $reserved[6][$i] = true;
                $matrix[6][$i] = ($i % 2 == 0) ? 1 : 0;
            }
            if (!$reserved[$i][6]) {
                $reserved[$i][6] = true;
                $matrix[$i][6] = ($i % 2 == 0) ? 1 : 0;
            }
        }

        // 4. Dark module
        $reserved[$qrSize - 8][8] = true;
        $matrix[$qrSize - 8][8] = 1;

        // 5. Reserve format info
        for ($i = 0; $i < 9; $i++) {
            $reserved[8][$i] = true;
            $reserved[$i][8] = true;
        }
        for ($i = 0; $i < 8; $i++) {
            $reserved[8][$qrSize - 1 - $i] = true;
            $reserved[$qrSize - 1 - $i][8] = true;
        }

        // 6. Data Placement
        $finalBits = '';
        foreach ($finalCodewords as $cw) {
            $finalBits .= str_pad(decbin($cw), 8, '0', STR_PAD_LEFT);
        }
        $bitIdx = 0;
        $bitLen = strlen($finalBits);

        $right = $qrSize - 1;
        $up = true;
        while ($right > 0) {
            if ($right == 6) $right--; // Skip vertical timing
            $rows = $up ? range($qrSize - 1, 0) : range(0, $qrSize - 1);
            foreach ($rows as $r) {
                foreach ([$right, $right - 1] as $c) {
                    if (!$reserved[$r][$c]) {
                        $bit = ($bitIdx < $bitLen) ? intval($finalBits[$bitIdx]) : 0;
                        $bitIdx++;
                        // Apply Mask 0: (row + col) % 2 == 0
                        $mask = (($r + $c) % 2 == 0) ? 1 : 0;
                        $matrix[$r][$c] = $bit ^ $mask;
                    }
                }
            }
            $up = !$up;
            $right -= 2;
        }

        // 7. Format Information (Mask 0, Level M: bits 101010000010010)
        $fmtBits = '101010000010010';
        $fmtCoords = [
            [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
            [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
        ];
        for ($i = 0; $i < 15; $i++) {
            $val = intval($fmtBits[$i]);
            $matrix[$fmtCoords[$i][0]][$fmtCoords[$i][1]] = $val;
            if ($i < 8) {
                $matrix[$qrSize - 1 - $i][8] = $val;
            } else {
                $matrix[8][$qrSize - 15 + $i] = $val;
            }
        }

        // Render SVG with clean rounded modules
        $fullSize = $qrSize + ($margin * 2);
        $rects = [];
        for ($r = 0; $r < $qrSize; $r++) {
            for ($c = 0; $c < $qrSize; $c++) {
                if ($matrix[$r][$c] === 1) {
                    $x = $c + $margin;
                    $y = $r + $margin;
                    $rects[] = "<rect x=\"$x\" y=\"$y\" width=\"1\" height=\"1\" fill=\"#0f172a\" rx=\"0.15\"/>";
                }
            }
        }

        $svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 $fullSize $fullSize\" width=\"$size\" height=\"$size\" shape-rendering=\"geometricPrecision\">\n";
        $svg .= "  <rect width=\"100%\" height=\"100%\" fill=\"#ffffff\" rx=\"4\"/>\n";
        $svg .= "  " . implode("\n  ", $rects) . "\n";
        $svg .= "</svg>";

        return $svg;
    }
}
