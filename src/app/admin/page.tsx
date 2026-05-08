"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getFlag } from "@/lib/flags";
import Image from "next/image";
import Link from "next/link";
import { WC_GROUPS } from "@/lib/wcGroups";
import { AdminSummary } from "@/components/admin/AdminSummary";
import { GROUP_EMOJI_OPTIONS } from "@/lib/groupAvatar";
import { STAGES, type StagePointsMap, defaultStagePoints, loadStagePoints } from "@/lib/stagePoints";
