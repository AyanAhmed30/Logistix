'use client';

import { useState } from 'react';
import { login } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Image from 'next/image';

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsLoading(true);
        const formData = new FormData(e.currentTarget);

        const result = await login(formData);

        if (result?.error) {
            toast.error(result.error);
            setIsLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-light-bg p-4 relative overflow-hidden">
            {/* Decorative background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-dark/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-accent/10 rounded-full blur-3xl" />

            <Card className="w-full max-w-md shadow-2xl border-none glassmorphism bg-white/90 backdrop-blur-md z-10">
                <CardHeader className="space-y-4 pb-8 flex flex-col items-center">
                    <div className="relative w-48 h-16 mb-2">
                        <Image
                            src="/logo.jpg"
                            alt="Logistix Logo"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                    <CardDescription className="text-center text-secondary-muted font-medium text-lg">
                        Secure Logistics Portal Login
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-6 pt-2">
                        <div className="space-y-2">
                            <Label htmlFor="username" className="text-primary-dark font-semibold">Username</Label>
                            <Input
                                id="username"
                                name="username"
                                placeholder="Enter username"
                                required
                                className="border-light-bg focus:border-primary-accent focus:ring-primary-accent text-lg py-6"
                                autoComplete="off"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-primary-dark font-semibold">Password</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                placeholder="••••••••"
                                required
                                className="border-light-bg focus:border-primary-accent focus:ring-primary-accent text-lg py-6"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="pb-10 pt-4">
                        <Button
                            className="w-full text-lg py-6 bg-primary-dark hover:bg-primary-accent text-white transition-all duration-300 shadow-lg hover:shadow-primary-accent/30"
                            type="submit"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Authenticating...' : 'Sign In to Portal'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            <div className="absolute bottom-4 text-primary-dark/60 text-sm font-medium">
                &copy; 2026 Logistix Express Private Limited. All rights reserved.
            </div>
        </div>
    );
}
