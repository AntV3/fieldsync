# PWA Phone Test Checklist

Run this on one iPhone and one Android phone against the production
Vercel URL before any release that touches the field flow. It costs
nothing and is the only way to confirm the installed web app actually
holds up on a jobsite.

Record the device, OS version, and date at the top of each run.

## 1. Install

| Step | iPhone (Safari) | Android (Chrome) | Pass? |
|---|---|---|---|
| Open the production URL in the browser | | | |
| Install banner appears within a few seconds | Shows "Tap Share, then Add to Home Screen" | Shows an **Install** button | |
| Follow the install steps | Share → Add to Home Screen → Add | Tap Install → Install | |
| FieldSync icon appears on the home screen with the correct icon | | | |
| Launch from the icon: opens full screen with no browser bar | | | |
| Dismiss the banner instead, reload: banner stays hidden | | | |

## 2. Field login

| Step | Pass? |
|---|---|
| Enter company code and 4-digit PIN | |
| Wrong PIN shows an error, correct PIN logs in | |
| Close the app fully and reopen: session is remembered | |

## 3. T&M ticket end to end

| Step | Pass? |
|---|---|
| Start a new T&M ticket | |
| Camera opens from the photo step (rear camera, not the photo library) | |
| Take a photo: it attaches with a thumbnail | |
| Pick an existing photo from the library as well | |
| Location permission prompt appears once; GPS stamp shows on the ticket | |
| Deny location: ticket still saves, just without a GPS stamp | |
| Fill crew hours and materials, reach Review | |
| Submit: ticket appears on the office dashboard within a few seconds | |

## 4. Signatures

| Step | Pass? |
|---|---|
| Open a ticket's signature page | |
| Draw a signature with a finger: strokes are smooth, no page scroll while drawing | |
| Clear and redraw works | |
| Save: signature shows on the ticket and in the PDF export | |

## 5. Offline

| Step | Pass? |
|---|---|
| Turn on Airplane Mode | |
| Offline indicator appears | |
| Create a T&M ticket with a photo while offline: it saves locally | |
| Pending count shows 1 | |
| Turn Airplane Mode off | |
| Ticket syncs automatically; pending count returns to 0 | |
| Ticket and photo visible on the office dashboard | |

## 6. Updates

| Step | Pass? |
|---|---|
| Deploy a visible change to production | |
| Reopen the installed app: new version loads within one or two launches | |

## Known limits of the web app path

- No push notifications. iOS web push needs the home-screen install and a
  server that sends pushes; neither is wired up yet.
- No haptic feedback on iPhone (Android supports vibration in the browser).
- Camera access from the installed app requires HTTPS, which Vercel provides.

Log any failure as a GitHub issue with the device, OS version, and the step
number from this checklist.
