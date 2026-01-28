'use client';

import { useState } from 'react';
import { createUser } from '@/app/actions/user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function CreateUserForm() {
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const result = await createUser(formData);

        if (result && 'error' in result) {
            toast.error(result.error);
        } else {
            toast.success('User account generated successfully');
            (e.target as HTMLFormElement).reset();
        }

        setIsLoading(false);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input name="username" placeholder="johndoe" required autoComplete="off" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input name="password" type="password" placeholder="••••••••" required />
            </div>
            <Button
                className="w-full bg-blue-600 hover:bg-blue-700 mt-2"
                type="submit"
                disabled={isLoading}
            >
                {isLoading ? 'Creating...' : 'Generate User Account'}
            </Button>
        </form>
    );
}
