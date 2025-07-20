import Navbar from "@/modules/home/ui/components/navbar";

interface Props {
  children: React.ReactNode;
}

const Layout: React.FC<Props> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="sticky top-0 z-10">
        <Navbar />
      </header>
      <main
        className="flex-1 overflow-y-auto"
        style={{
          backgroundImage: `
          radial-gradient(circle, rgba(102, 102, 102, 0.24) 1px, transparent 1px),
          radial-gradient(circle, rgba(102, 102, 102, 0.12) 1px, transparent 1px)
        `,
          backgroundSize: "20px 20px, 40px 40px",
          backgroundPosition: "0 0, 10px 10px",
        }}
      >
        {children}
      </main>
    </div>
  );
};

export default Layout;
