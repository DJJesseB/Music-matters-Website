<?php
/**
 * DJ Live Request Desk & Event Manager - Active Configuration
 */

return array (
  'configured' => false,
  'db' => 
  array (
    'driver' => 'mysql',
    'host' => 'localhost',
    'port' => 3306,
    'name' => '',
    'user' => '',
    'pass' => '',
    'charset' => 'utf8mb4',
    'prefix' => 'dj_',
  ),
  'admin' => 
  array (
    'email' => 'admin@example.com',
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
  'email' => 
  array (
    'enabled' => false,
    'provider' => 'resend',
    'api_key' => '',
    'from_name' => 'DJ Jesse B',
    'from_email' => 'onboarding@resend.dev',
    'reply_to' => 'djgourmet@me.com',
    'admin_copy' => false,
  ),
);
