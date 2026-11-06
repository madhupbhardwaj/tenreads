# Tenreads

Score every book you read, out of 10. The same app as Tenbars, built for books.

Plain HTML, CSS and JavaScript in one `index.html`, with Firebase for Google sign-in and saved ratings, and Open Library for book data and covers (free, no API key).

## What carried over from Tenbars

| Tenbars | Tenreads |
| --- | --- |
| Search a series, score the series | Search a book (or author), score it out of 10 |
| Score each episode | Score each book in an author's list, right on their page |
| Quick rate (one episode at a time) | Quick rate (one book at a time) on any list: a genre, search results, or an author's books |
| Every episode at a glance (heat grid) | Your shelf by score: every rated book as a small cover, grouped 10 down to 1 |
| Levels (Pilot … Showrunner) | Levels (Page Turner … Librarian), at 3, 10, 25, 50 and 100 books |
| Google sign-in, cloud sync, guest ratings move into your account | Same |
| Usernames, public profiles at `/@name`, people search | Same |
| Compare with a friend on a series | Compare with a friend on a book (`/@name/book/OL…W`) |
| Rich link previews for shared profiles | Same (`api/page.js`) |
| Installable app (PWA) | Same |

Added for books: author pages, "More by this author" on every book page, and genre tabs on Browse.

## Run it on your computer

```
python3 -m http.server 8000
```

Open http://localhost:8000. Without Firebase set up, ratings are saved in the browser only.

## Turn on accounts (Firebase)

1. Create a **new** Firebase project for Tenreads. Use a separate one from Tenbars: Firestore rules apply to the whole project, so publishing these rules to the Tenbars project would replace its rules and break it.
2. Add a web app, copy the config, and paste it into `FIREBASE_CONFIG` near the top of the script in `index.html`. (Already filled in for the `tenreads-9ecf6` project. The web apiKey is meant to be public; what protects the data is `firestore.rules`.)
3. Authentication > Sign-in method: turn on Google. Under Settings > Authorized domains, add your Vercel domain.
4. Firestore Database: create one, then paste `firestore.rules` into the Rules tab and publish.
5. Where the data lives: `usernames/{name}`, `profiles/{uid}`, `users/{uid}/books/{workId}`.

## Deploy on Vercel

Import the repo (no build settings needed). Then add one environment variable so shared profile and book links get proper previews:

`FIREBASE_PROJECT_ID` = `tenreads-9ecf6` (the same as `projectId` in `index.html`). Redeploy after adding it.

Without it everything works; shared links just show the generic Tenreads card.

## Change the name or domain

`tenreads.vercel.app` appears in `index.html` (canonical and og tags) and in the picture `og.png`. Replace it with your real address. The app name "Tenreads" appears in `index.html`, `manifest.webmanifest`, `sw.js` and `api/page.js`.

## Easy things to tweak

- Levels: the `LEVELS` list in `index.html`.
- Genre tabs on Browse: the `GENRES` list (label, then the Open Library subject name).
- Colours: the variables at the top of the CSS (`--signal` is the green).

## Notes

- Open Library is run by a non-profit and can be slow or briefly rate-limit. The app retries and shows a "Try again" button.
- Some books have no cover; they show their initials instead.
- Book ids are Open Library work ids (`OL45804W`), so a rating always belongs to the book itself, not one edition.
