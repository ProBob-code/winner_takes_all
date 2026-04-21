export const runtime = 'edge';

function Error({ statusCode }: { statusCode: number }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#080512',
      color: '#f8fafc'
    }}>
      <h1 style={{ fontSize: '3rem', margin: 0 }}>{statusCode || "Error"}</h1>
      <p style={{ color: '#94a3b8' }}>
        {statusCode
          ? `An error ${statusCode} occurred on server`
          : 'An error occurred on client'}
      </p>
      <a href="/" style={{ 
        marginTop: '2rem', 
        color: '#8b5cf6', 
        textDecoration: 'none',
        fontWeight: 'bold'
      }}>Go back home</a>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: any) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
