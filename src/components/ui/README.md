# UI primitives

This directory contains the minimal shared presentational primitives used across all product categories.

To find the button primitive with size and variant treatment visit [Button.tsx](file:///C:/Hackathons/Parallex/src/components/ui/Button.tsx).

To find the status badge with tone mapping for working, success, danger, and neutral states visit [Badge.tsx](file:///C:/Hackathons/Parallex/src/components/ui/Badge.tsx).

To find the card container visit [Card.tsx](file:///C:/Hackathons/Parallex/src/components/ui/Card.tsx).

To find the accessible spinner with a required label visit [Spinner.tsx](file:///C:/Hackathons/Parallex/src/components/ui/Spinner.tsx).

The shared style tokens behind these primitives can be found in [globals.css](file:///C:/Hackathons/Parallex/src/app/globals.css).

## Architectural decisions

- A deliberately tiny primitive set keeps typography, contrast, focus, and disabled treatments consistent; product components compose these instead of introducing one-off styled elements.
- State treatments (disabled, pending, focus) live on the primitives, so accessibility fixes apply everywhere at once.
