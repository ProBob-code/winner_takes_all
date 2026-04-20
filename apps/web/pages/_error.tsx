import NextError from 'next/error';

export const runtime = 'edge';

export default function CustomError({ statusCode }: { statusCode: number }) {
  return <NextError statusCode={statusCode} />;
}

CustomError.getInitialProps = ({ res, err }: any) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};
