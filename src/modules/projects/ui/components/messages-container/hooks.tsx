import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import React from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Fragment } from "@/generated/prisma";
import {
  SCROLL_CONSTANTS,
  MESSAGES_CONSTANTS,
  FORM_CONSTANTS,
  formSchema,
} from "./constants";
import { useDebounce } from "./utils";
import {
  ExtendedMessage,
  ScrollManagementReturn,
  MessagesContainerProps,
  MessagesContainerReturn,
  MessageFormData,
} from "./types";

const useFragmentManagement = (
  messages: ExtendedMessage[],
  setActiveFragment: (fragment: Fragment | null) => void
): void => {
  const isFirstRun = React.useRef(true);
  const prevMessagesLength = React.useRef(messages.length);

  // Memoize the last assistant message to avoid recalculation
  const lastAssistantMessage = React.useMemo(() => {
    return messages.findLast(
      (message) => message.role === "ASSISTANT" && message.fragment
    );
  }, [messages]);

  React.useEffect(() => {
    if (!lastAssistantMessage?.fragment) return;

    if (isFirstRun.current) {
      setActiveFragment(lastAssistantMessage.fragment);
      isFirstRun.current = false;
    } else if (messages.length > prevMessagesLength.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === "ASSISTANT" && lastMessage.fragment) {
        setActiveFragment(lastMessage.fragment);
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, setActiveFragment]);
};

const useScrollManagement = (
  messages: ExtendedMessage[]
): ScrollManagementReturn => {
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [showGradient, setShowGradient] = React.useState(false);
  const [isUserScrolling, setIsUserScrolling] = React.useState(false);
  const autoScrollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = React.useCallback(() => {
    const current = scrollContainerRef.current;
    if (current) {
      current.scrollTop = current.scrollHeight;
    }
  }, []);

  const handleScrollLogic = React.useCallback(() => {
    const current = scrollContainerRef.current;
    if (!current) return;

    const isScrolledToBottom =
      current.scrollHeight - current.scrollTop <=
      current.clientHeight + SCROLL_CONSTANTS.SCROLL_THRESHOLD;
    const isOverflowing = current.scrollHeight > current.clientHeight;

    setShowGradient(isOverflowing && !isScrolledToBottom);

    // Detect if user is manually scrolling
    if (!isScrolledToBottom && isOverflowing) {
      setIsUserScrolling(true);

      // Reset user scrolling flag after a delay
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
      autoScrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, SCROLL_CONSTANTS.AUTO_SCROLL_TIMEOUT);
    } else if (isScrolledToBottom) {
      setIsUserScrolling(false);
    }
  }, []);

  // Debounce scroll events for better performance
  const debouncedHandleScroll = useDebounce(
    handleScrollLogic,
    MESSAGES_CONSTANTS.SCROLL_DEBOUNCE_DELAY
  );

  React.useLayoutEffect(() => {
    // Only auto-scroll if user is not manually scrolling
    if (!isUserScrolling) {
      scrollToBottom();
    }
    handleScrollLogic();
  }, [messages, handleScrollLogic, isUserScrolling, scrollToBottom]);

  React.useEffect(() => {
    const current = scrollContainerRef.current;
    const handleResize = () => debouncedHandleScroll();

    handleScrollLogic();

    if (current) {
      current.addEventListener("scroll", debouncedHandleScroll);
      window.addEventListener("resize", handleResize);
    }

    return () => {
      if (current) {
        current.removeEventListener("scroll", debouncedHandleScroll);
      }
      window.removeEventListener("resize", handleResize);
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, [debouncedHandleScroll, handleScrollLogic]);

  return {
    scrollContainerRef,
    showGradient,
    setIsUserScrolling,
  };
};

export const useMessagesContainer = ({
  projectId,
  setActiveFragment,
}: Omit<MessagesContainerProps, "activeFragment">): MessagesContainerReturn => {
  const form = useForm<MessageFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      [FORM_CONSTANTS.FORM_FIELD_NAMES.VALUE]: "",
    },
  });

  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const { data: usage } = useQuery(
    trpc.usage.status.queryOptions(undefined, {
      refetchOnWindowFocus: false,
    })
  );

  const { data: messages, refetch } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions(
      {
        projectId,
      },
      { refetchInterval: MESSAGES_CONSTANTS.REFETCH_INTERVAL }
    )
  );

  const { data: projects } = useSuspenseQuery(
    trpc.projects.getMany.queryOptions(undefined, {
      refetchInterval: false,
      refetchOnWindowFocus: false,
    })
  );

  const { scrollContainerRef, showGradient, setIsUserScrolling } =
    useScrollManagement(messages);

  useFragmentManagement(messages, setActiveFragment);

  const mutationOptions = React.useMemo(
    () =>
      trpc.messages.create.mutationOptions({
        onError: (error) => {
          toast.error(error.message);
        },
        onSuccess: () => {
          form.reset();
          refetch();
          queryClient.invalidateQueries({
            queryKey: trpc.messages.getMany.queryKey({ projectId }),
          });
          //TODO: invalidate usage status
        },
      }),
    [form, refetch, queryClient, projectId]
  );

  const createMessage = useMutation(mutationOptions);

  const onSubmit = React.useCallback(
    (data: MessageFormData) => {
      const fieldValue = data[FORM_CONSTANTS.FORM_FIELD_NAMES.VALUE];
      if (fieldValue.trim()) {
        // Reset user scrolling flag when user sends a message
        setIsUserScrolling(false);
        createMessage.mutate({ userPrompt: fieldValue, projectId });
      }
    },
    [createMessage, projectId, setIsUserScrolling]
  );

  // Memoize expensive computations
  const isLoadingMessage = React.useMemo(() => {
    return messages[messages.length - 1]?.role === "USER";
  }, [messages]);

  return {
    form,
    scrollContainerRef,
    messages,
    projects,
    createMessage,
    onSubmit,
    showGradient,
    isLoadingMessage,
    usage,
  };
};
