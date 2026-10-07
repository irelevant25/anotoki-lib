#!/bin/sh
# What a site's vendor/anotoki/lib holds: Composer installs GitHub's archive of the tag, which
# .gitattributes trims to the PHP half. This builds the same archive of HEAD (git archive, as GitHub's
# does) and checks it: nothing but the PHP half and the three files beside it, every file a site needs
# at run time there, and the SQL and the JSON with LF line endings.
#
#   sh .github/scripts/check-archive.sh [TREE-ISH]    (HEAD by default)
set -eu

archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
git archive --format=tar "${1:-HEAD}" > "$archive"
list=$(tar -tf "$archive")
status=0

# Nothing from the Angular workspace, the tests, the workflows - or a folder added later.
unexpected=$(printf '%s\n' "$list" | grep -v -E '^(composer\.json|README\.md|CHANGELOG\.md|php/|php/(src|migrations|resources)/.*)$' || true)
if [ -n "$unexpected" ]; then
    printf '::error::The Composer archive holds what no site needs:\n%s\n' "$unexpected"
    status=1
fi
if printf '%s\n' "$list" | grep -q -E '^(angular|php/tests)/'; then
    echo '::error::The Composer archive holds the Angular workspace or the tests.'
    status=1
fi

# What a site needs at run time: the code, the migration files of the library's sets, its words.
for file in \
    composer.json README.md CHANGELOG.md \
    php/src/Migrations/Migrator.php \
    php/src/Support/JsonResponse.php \
    php/src/Translations/Translations.php \
    php/src/Translations/Http/TranslationsRoutes.php \
    php/migrations/translations/001_languages_and_strings.sql \
    php/migrations/translations/002_library_words.sql \
    php/resources/library-words.json
do
    if ! printf '%s\n' "$list" | grep -q -x -F "$file"; then
        echo "::error::$file is not in the Composer archive."
        status=1
    fi
done

# Byte for byte, whatever the checkout: a migration's last line is read, and the words are held to the SQL.
cr=$(printf '\r')
for file in $(printf '%s\n' "$list" | grep -E '^php/(migrations|resources)/.*[^/]$'); do
    if tar -xOf "$archive" "$file" | grep -q "$cr"; then
        echo "::error::$file has CR line endings in the archive."
        status=1
    fi
done

if [ "$status" -eq 0 ]; then
    echo "The Composer archive holds $(printf '%s\n' "$list" | grep -c -v '/$') files, all of the PHP half."
fi
exit "$status"
