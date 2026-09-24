import { NotFoundBody } from "@/components/not-found-body";
import { SiteHeader } from "@/components/site-header";

// Any link that isn't a page lands here, including a component slug that
// doesn't exist. The body works out what you were probably after.
export default function NotFound() {
  return (
    <>
      <title>Not found · ui lab</title>
      <SiteHeader title="Not found" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
        <NotFoundBody />
      </main>
    </>
  );
}
