import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b border-chrome-border bg-chrome backdrop-blur supports-[backdrop-filter]:bg-chrome">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <h1 className="text-xl font-semibold tracking-normal text-foreground">
                Imaginate
              </h1>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
