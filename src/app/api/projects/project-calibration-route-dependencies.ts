import "server-only";

import { cookies } from "next/headers";

import {
  ListProjectCalibrations,
  SaveProjectCalibration,
} from "@/application/project-calibration/project-calibration-use-cases";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import {
  SupabaseProjectCalibrationReader,
  SupabaseProjectCalibrationWriter,
} from "@/infrastructure/project-calibration/supabase-project-calibration-storage";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

function serviceEnvironment() {
  try {
    const environment = parseServerEnvironment(process.env);
    if (
      !environment.NEXT_PUBLIC_SUPABASE_URL ||
      !environment.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("missing");
    }
    return {
      supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    };
  } catch (error) {
    throw new Error("project_calibration_configuration_missing", { cause: error });
  }
}

export async function createProjectCalibrationUseCases(responseHeaders: Headers) {
  const sessionClient = createSupabaseServerClient({
    environment: {
      APP_ORIGIN: process.env.APP_ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    cookieStore: await cookies(),
    responseHeaders,
  });
  const sessionReader = new SupabaseVerifiedSessionReader(sessionClient);
  const reader = new SupabaseProjectCalibrationReader(
    sessionClient as ConstructorParameters<typeof SupabaseProjectCalibrationReader>[0],
  );
  const writer = {
    save(input: Parameters<SupabaseProjectCalibrationWriter["save"]>[0]) {
      const environment = serviceEnvironment();
      return new SupabaseProjectCalibrationWriter({
        supabaseUrl: environment.supabaseUrl,
        serviceRoleKey: environment.serviceRoleKey,
      }).save(input);
    },
  };
  return {
    list: new ListProjectCalibrations({ sessionReader, reader }),
    save: new SaveProjectCalibration({ sessionReader, writer }),
  };
}
