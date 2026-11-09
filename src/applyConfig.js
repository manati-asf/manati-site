// Single switch for the public application entry point.
//
//   USE_NATI = true   → every "Apply" CTA opens the in-house Nati bot (/apply-bot),
//                        and the How-to-apply page shows Nati instead of the old Landbot.
//   USE_NATI = false  → roll back to the previous Landbot flow embedded on /how-to-apply.
//
// Rollback is one line: set USE_NATI to false and redeploy. Nothing else to change.
export const USE_NATI = true;

export const APPLY_HREF = USE_NATI ? '/apply-bot/' : '/how-to-apply/#apply-form';
