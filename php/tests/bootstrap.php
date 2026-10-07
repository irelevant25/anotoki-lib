<?php

declare(strict_types=1);

/*
 * The tests' bootstrap: Composer's autoloader (the library and, through
 * autoload-dev, php/tests/Support). The databases the tests need are made and
 * dropped by Support/TestDatabase.php, one per test case, on the PostgreSQL
 * server named by ANOTOKI_LIB_TEST_DB_CONFIG or ANOTOKI_LIB_TEST_PG*.
 */

require dirname(__DIR__, 2) . '/vendor/autoload.php';
