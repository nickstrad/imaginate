interface Props {
  children: React.ReactNode;
}

const Layout: React.FC<Props> = ({ children }) => {
  return (
    <div
      className="flex flex-col h-screen"
      style={{
        background: "white",
        backgroundImage: `
          radial-gradient(circle, rgba(102, 102, 102, 0.08) 1px, transparent 1px),
          radial-gradient(circle, rgba(102, 102, 102, 0.04) 1px, transparent 1px)
        `,
        backgroundSize: "20px 20px, 40px 40px",
        backgroundPosition: "0 0, 10px 10px",
      }}
    >
      <header className="bg-gray-800 text-white p-4">
        <h1 className="text-xl font-bold">Home Layout</h1>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};

export default Layout;
