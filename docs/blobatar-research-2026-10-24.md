# Blobatars: Pinkslip's own default avatars (research, 2026-10-24)

The owner asked to see Pinkslip's own default avatars, drawn in the mascot
rounds' closest style (ink outline, lumpy body, expressive brows) rather than
picked from a library (option B after the 2026-10-22 survey,
[avatar-libraries-2026-10-22.md](avatar-libraries-2026-10-22.md)).

## The moment

Anyone without a photo: you on You (56) and recruiters and contacts on People
(40), seen many times a day. The avatar has to tell people apart at a glance
and give Pinkslip some warmth, without reading as a kids' app, and it never
asks for attention.

## What the reading says

- **Silhouette first.** A character should be recognizable from its outline
  when scaled small; strong silhouette, enough contrast, no tiny details
  ([Skinbase](https://skinbase.org/academy/lessons/design-a-strong-avatar-identity),
  [Lovart's character guide](https://www.lovart.ai/blog/ai-character-design-guide-how-to-create-consistent-characters-with-ai-tools)).
- **Draw for each size.** GNOME's default-avatar proposal renders differently
  per size because thin lines and text stop reading when small
  ([GNOME Fractal #218](https://gitlab.gnome.org/GNOME/fractal/issues/218));
  design systems fix a few tiers so parts are drawn for a known range
  ([PatternFly](https://patternfly.org/components/avatar/design-guidelines)).
  For us: the ink line is set in points at 40 and at 56, not scaled.
- **Expression over likeness.** Notion's system was redrawn by BUCK from
  Roman Muradov's style, every part hand-drawn and lined up as one set, so
  the avatars bring "play and delight" rather than physical likeness
  ([BUCK, Notion Faces](https://buck.co/work/notion-faces)).
- **One seed, one face.** From the survey: a part-based definition run by one
  engine gives the same face for the same person on web and iOS.

## The mascot rounds' rules (2026-10-13/14)

Rejected: animals, the slip with a face, shaded or two-tone blobs, flat
clip-art, big glossy eyes, blush and "yay" arms. Closest: an ink outline
with a slight hand wobble, a lumpy asymmetric body, eyebrows, eye whites with
pupils, mouths with an inside. No figure inside list rows beyond the avatar.

## So the parts are

One flat body color, an ink outline, and a face of brows, eyes and mouth;
optional small extras (a sprout, freckles, glasses). Bodies differ enough to
read as a silhouette at 40. Colors come from around the brand pink and the
tile tints.

## The rounds (Paper "Blobatars · Oct 24")

1. **Ink outline blobs** (peek, whole, paper): "a bit too kiddy".
2. **Flat and sparse** (glance, mark, cutout), after the sets the owner liked
   (Cameo, Cutouts, Dylan, Line Face, Gaze, Facehash): "too simple ... low
   effort and kind of sloppy".
3. **Neon robot crew and three-hue orbs**, after two Dribbble references.
   I argued these didn't fit the app: neon is louder than the pink that
   means "do this", and robot faces on recruiters read as bots. The owner
   agreed to try a quieter take. Not put in Paper.
4. **Orb faces and portraits.** Orb faces use soft two-hue orbs in the
   tile hues, a line face and a hair over the edge. Portraits are a
   head-and-shoulders figure in the circle, the owner's idea. The owner
   liked the orb faces and dropped the portraits. Paper's renderer and
   react-native-svg both draw radial gradients, so the soft blend uses
   those rather than blur filters.
5. **Eight art styles on the orb**, each with its own eyes, mouths, noses
   and tops (hair, hats, accessories, or none): marker, Bauhaus, one line,
   riso print, pixel, linocut, paper collage, embroidered patch. The owner
   asked for distinct styles, not variations on one. **Tabled (owner,
   2026-10-24): "im not happy with any of these."** People keep the round
   initials avatar until this is picked up again.

What held across rounds:
- The lines are set in points for each size.
- Faces are scaled up a little at 40.
- Hair and hats stay neutral, since a default avatar only knows a name.
- No blush, no glossy eyes.
