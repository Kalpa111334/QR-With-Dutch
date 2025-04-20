declare module '@react-pdf/renderer' {
  import { ComponentType, ReactElement, ReactNode } from 'react';

  export interface DocumentProps {
    children?: ReactNode;
    title?: string;
  }

  export interface PageProps {
    size?: string | [number, number];
    orientation?: 'portrait' | 'landscape';
    children?: ReactNode;
    style?: any;
  }

  export interface ViewProps {
    style?: any;
    children?: ReactNode;
  }

  export interface TextProps {
    style?: any;
    children?: ReactNode;
  }

  export const Document: ComponentType<DocumentProps>;
  export const Page: ComponentType<PageProps>;
  export const View: ComponentType<ViewProps>;
  export const Text: ComponentType<TextProps>;
  export const PDFViewer: ComponentType<{ children?: ReactNode; style?: any }>;
  export const PDFDownloadLink: ComponentType<{
    document: ReactElement;
    fileName?: string;
    style?: any;
    children?: ReactNode | ((props: { blob: Blob; url: string; loading: boolean; error: Error | null }) => ReactNode);
  }>;
} 