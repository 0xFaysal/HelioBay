import { AdminDevices } from "@/components/credit/admin-devices";
import { ApiAdminResources } from "@/components/credit/api-admin";
import { isDemo } from "@/lib/config";
export default function Page() { return isDemo?<AdminDevices/>:<ApiAdminResources resource="devices"/>; }
