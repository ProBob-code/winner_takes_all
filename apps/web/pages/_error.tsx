export const config = {
  runtime: "experimental-edge",
};

function Error() {
  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h1>An error occurred</h1>
      <p>Please try again later.</p>
    </div>
  );
}

export default Error;
