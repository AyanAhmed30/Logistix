"use client";

import React from "react";
import { ErrorFallback } from "@/components/error/ErrorFallback";

type ClientErrorBoundaryProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
  resetKey?: string | number | null;
  onReset?: () => void;
  compact?: boolean;
  showErrorMessage?: boolean;
};

type ClientErrorBoundaryState = {
  error: Error | null;
};

export class ClientErrorBoundary extends React.Component<
  ClientErrorBoundaryProps,
  ClientErrorBoundaryState
> {
  state: ClientErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ClientErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ClientErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ClientErrorBoundary]", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  private handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.assign("/");
    }
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          title={this.props.title}
          description={this.props.description}
          errorMessage={
            this.props.showErrorMessage ? this.state.error.message : null
          }
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
          compact={this.props.compact}
        />
      );
    }

    return this.props.children;
  }
}
