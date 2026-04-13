# Designer Workflow

## What this tool does for you

When you paste in a marketplace homepage URL, the generator tries to do the setup work automatically:

- grabs the live site header
- grabs the homepage hero/banner area
- reduces the carousel to one slide for easier proofing
- pulls in the site's main CSS file
- includes any Google Font links the page is already using
- adds small helper CSS and JS so the prototype behaves better

## What you still do manually

- confirm the extracted hero is the right one
- confirm the detected CSS file is the right one
- save the generated CodePen to your own account
- update the image URL, heading, supporting copy, CTA label, and CTA link
- duplicate or remix slides as needed for the promotion

## Basic steps

1. Open the generator.
2. Paste the marketplace homepage URL.
3. Click `Inspect Site`.
4. Review the preview.
5. If something looks off, edit the HTML or external CSS URLs in the generator before opening CodePen.
6. Click `Open In CodePen`.
7. In CodePen, save the Pen to your account.
8. Update the banner content for the concept you are building.

## What to edit in CodePen

Most banner changes should happen in the HTML panel:

- background image URL
- heading text
- supporting text
- CTA label
- CTA link

You usually should not need to rewrite the layout. The point of this starter is to preserve the live marketplace structure and CSS so the proof is closer to what BigCommerce will actually render.

## When to ask for help

Ask for a selector update if:

- the wrong carousel was extracted
- the header is missing
- the font looks wrong
- the page looks unstyled
- the site has a custom framed banner layout that did not come through cleanly

Those are usually fixable in the generator once, then everyone benefits after that.
