<?php

declare(strict_types=1);

// A site's routes file: a closure at the file's own scope, which PHP 8.4 names by the file's absolute path
// and its line ("{closure:/var/www/site/routes.php:12}") - the error log names the file relative.
return static function (): never {
    throw new RuntimeException('Failed in a routes file');
};
