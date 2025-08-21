import Image from "next/image";
import { format } from "date-fns";
import { ChevronRightIcon, Code2Icon, LoaderIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Fragment, MessageRole, MessageType } from "@/generated/prisma";

interface UserMessageProps {
  content: string;
}

const UserMessage = ({ content }: UserMessageProps) => {
  return (
    <div className="flex justify-end pb-4 pr-2 pl-10">
      <Card className="rounded-lg bg-muted p-3 shadow-none border-none max-w-[80%] break-words">
        {content}
      </Card>
    </div>
  );
}

interface FragmentCardProps {
  fragment: Fragment;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: Fragment) => void;
  projectId: string;
};

const FragmentCard = ({
  fragment,
  isActiveFragment,
  onFragmentClick,
  projectId,
}: FragmentCardProps) => {
  const [isRestoring, setIsRestoring] = useState(false);

  const handleFragmentClick = async () => {
    if (isRestoring) return;

    // Se não tem commitSha, usar comportamento original
    if (!fragment.commitSha) {
      onFragmentClick(fragment);
      return;
    }

    // Restaurar commit
    try {
      setIsRestoring(true);
      
      const response = await fetch('/api/restore-fragment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId,
          fragmentId: fragment.id,
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Erro ao restaurar fragment');
      }

      // Polling para aguardar resultado da restauração
      // Por enquanto, fallback para comportamento original
      console.log('Restauração iniciada:', data.inngestEventId);
      onFragmentClick(fragment);
      
    } catch (error) {
      console.error('Erro ao restaurar fragment:', error);
      // Fallback para comportamento original
      onFragmentClick(fragment);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <button
      className={cn(
        "flex items-start text-start gap-2 border rounded-lg bg-muted w-fit p-3 hover:bg-secondary transition-colors",
        isActiveFragment && 
          "bg-primary text-primary-foreground border-primary hover:bg-primary",
        isRestoring && "opacity-70 cursor-not-allowed",
      )}
      onClick={handleFragmentClick}
      disabled={isRestoring}
    >
      {isRestoring ? (
        <LoaderIcon className="size-4 mt-0.5 animate-spin" />
      ) : (
        <Code2Icon className="size-4 mt-0.5" />
      )}
      <div className="flex flex-col flex-1">
        <span className="text-sm font-medium line-clamp-1">
          {fragment.title}
        </span>
        <span className="text-sm">
          {isRestoring ? "Restaurando versão..." : "Preview"}
        </span>
      </div>
      <div className="flex items-center justify-center mt-0.5">
        {!isRestoring && <ChevronRightIcon className="size-4" />}
      </div>
    </button>
  );
};

interface AssistantMessageProps {
  content: string;
  fragment: Fragment | null;
  createdAt: Date;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: Fragment) => void;
  type: MessageType;
  projectId: string;
};

const AssistantMessage = ({
  content,
  fragment,
  createdAt,
  isActiveFragment,
  onFragmentClick,
  type,
  projectId,
}: AssistantMessageProps) => {
  return (
    <div className={cn(
      "flex flex-col group px-2 pb-4",
      type === "ERROR" && "text-red-700 dark:text-red-500",
    )}>
      <div className="flex items-center gap-2 pl-2 mb-2">
        <Image
          src="/logo.svg"
          alt="Vibe"
          width={18}
          height={18}
          className="shrink-0"
        />
        <span className="text-sm font-medium">Vibe</span>
        <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {format(createdAt, "HH:mm 'on' MMM dd, yyyy")}
        </span>
      </div>
      <div className="pl-8.5 flex flex-col gap-y-4">
        <span>{content}</span>
        {fragment && type === "RESULT" && (
          <FragmentCard
            fragment={fragment}
            isActiveFragment={isActiveFragment}
            onFragmentClick={onFragmentClick}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  )
};

interface MessageCardProps {
  content: string;
  role: MessageRole;
  fragment: Fragment | null;
  createdAt: Date;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: Fragment) => void;
  type: MessageType;
  projectId: string;
};

export const MessageCard = ({
  content,
  role,
  fragment,
  createdAt,
  isActiveFragment,
  onFragmentClick,
  type,
  projectId,
}: MessageCardProps) => {
  if (role === "ASSISTANT") {
    return (
      <AssistantMessage
        content={content}
        fragment={fragment}
        createdAt={createdAt}
        isActiveFragment={isActiveFragment}
        onFragmentClick={onFragmentClick}
        type={type}
        projectId={projectId}
      />
    )
  }

  return (
    <UserMessage content={content} />
  );
};
