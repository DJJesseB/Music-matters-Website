<?php
/**
 * DJ Live Request Desk & Event Manager - Active Configuration
 */

return array (
  'configured' => true,
  'db' => 
  array (
    'driver' => 'mysql',
    'host' => 'localhost',
    'port' => 3306,
    'name' => 'dbqgs92aggcp3s',
    'user' => 'ugjcymv7v2een',
    'pass' => 'MusicBitches!',
    'charset' => 'utf8mb4',
    'prefix' => 'djdesk_',
  ),
  'admin' => 
  array (
    'email' => 'jessandmac@gmail.com',
  ),
  'brand' => 
  array (
    'name' => 'DJ Jesse B',
    'tip_link' => '',
    'standard_deposit' => 250.0,
    'deposit_percent' => 20.0,
    'deposit_mode' => 'higher',
    'deposit_policy' => 'A non-refundable retainer reserves your event date once the agreement is signed and payment is verified. It is non-refundable, used for date reservation and administrative purposes, and credited toward your event total.',
  ),
  'security' => 
  array (
    'rate_limit_seconds' => 15,
    'max_requests_hour' => 30,
    'session_lifetime' => 604800,
  ),
  'stripe' => 
  array (
    'enabled' => false,
    'mode' => 'test',
    'publishable_key' => '',
    'secret_key' => '',
    'webhook_secret' => '',
  ),
);
