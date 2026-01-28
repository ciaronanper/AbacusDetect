import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { ActionButton } from "@/components/ActionButton";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md mx-auto shadow-xl border-border/50">
        <CardContent className="pt-6 text-center space-y-6">
          <div className="flex justify-center mb-4">
            <AlertCircle className="h-16 w-16 text-destructive opacity-80" />
          </div>
          
          <h1 className="text-3xl font-display font-bold text-gray-900">404 Page Not Found</h1>
          <p className="text-gray-500 font-medium">
            The screen you are looking for does not exist or has been moved.
          </p>

          <Link href="/" className="w-full block">
             <ActionButton fullWidth>Return to Home</ActionButton>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
