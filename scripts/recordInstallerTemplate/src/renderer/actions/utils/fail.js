import {log} from "./log";
import {action, status} from "../../stores/installation";

const discordURL = "https://github.com/InfluenceDevs/ReCord/issues";

export default function fail() {
    log("");
    log("If you keep seeing 'files are used by a different process', reboot Windows and run the installer before opening Discord.");
    log(`The ${action.value} seems to have failed. If this problem is recurring, join our discord community for support. ${discordURL}`);
    status.set("error");
}
