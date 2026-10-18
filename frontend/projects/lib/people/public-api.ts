/*
 * @anotoki/lib/people - the People page's configuration and the shape of its API
 * (the PHP half's Anotoki\Lib\People\Http\PeopleRoutes): provideAnotokiPeople()
 * in a site's app.config, or on the page's route. Small, and nothing else: the
 * page itself is @anotoki/lib/people/page, an entry point of its own that a
 * site's lazy admin route loads - never in a site's first load.
 */

export type { AnotokiPeopleConfig, PeopleColumn, PeopleDeleteConfig, PeopleDeleteQuestion, PeopleDeleted, PeopleList, PeoplePerson, PeopleSync, PeopleSyncRun, PeopleVisitors } from './src/config';
export { ANOTOKI_PEOPLE_CONFIG, DEFAULT_PEOPLE_API, provideAnotokiPeople } from './src/config';
